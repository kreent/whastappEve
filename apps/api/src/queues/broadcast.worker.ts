import { Worker, type Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";
import { whatsappService, WhatsAppApiError } from "../services/whatsapp.service.js";
import { BROADCAST_QUEUE_NAME, type BroadcastJobData } from "./broadcast.queue.js";
import { getRedis } from "./redis.js";

// Meta tier 0 baseline = ~80 messages/sec. We stay well below that.
// Each job = 1 message. Limit to 5/sec = 300/min by default.
const RATE_PER_SEC = Number(process.env.BROADCAST_RATE_PER_SEC ?? "5");

export function startBroadcastWorker(logger: FastifyBaseLogger): Worker<BroadcastJobData> {
  const worker = new Worker<BroadcastJobData>(
    BROADCAST_QUEUE_NAME,
    async (job: Job<BroadcastJobData>) => {
      await processRecipient(job.data, logger.child({ jobId: job.id }));
    },
    {
      connection: getRedis(),
      concurrency: Math.max(1, RATE_PER_SEC),
      limiter: {
        max: RATE_PER_SEC,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "broadcast recipient sent");
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "broadcast recipient failed");
  });
  worker.on("error", (err) => {
    logger.error({ err: err.message }, "broadcast worker error");
  });

  return worker;
}

async function processRecipient(
  data: BroadcastJobData,
  log: FastifyBaseLogger,
): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: data.recipientId },
    include: { contact: true, campaign: { include: { template: true } } },
  });
  if (!recipient) {
    log.warn("recipient not found, skipping");
    return;
  }
  if (recipient.status !== "pending" && recipient.status !== "queued") {
    log.debug({ status: recipient.status }, "recipient already processed");
    return;
  }
  if (recipient.contact.optedOut) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "skipped_opted_out", errorMessage: "contact opted out" },
    });
    return;
  }
  const campaign = recipient.campaign;
  if (campaign.status === "cancelled") {
    log.info({ campaignId: campaign.id }, "campaign cancelled, skipping");
    return;
  }
  const template = campaign.template;
  if (template.status !== "approved") {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", errorMessage: "template not approved" },
    });
    return;
  }

  const params = (recipient.resolvedParams as string[]) ?? [];
  const components = params.length
    ? [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ]
    : undefined;

  let didThrow = false;
  let throwErr: unknown = null;
  try {
    const result = await whatsappService.sendTemplate({
      to: recipient.contact.phoneNumber,
      templateName: template.name,
      languageCode: template.language,
      components,
    });
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "sent",
        whatsappMessageId: result.whatsappMessageId,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof WhatsAppApiError
        ? (err.body as { error?: { message?: string } })?.error?.message ?? err.message
        : (err as Error).message;
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", errorMessage },
    });
    didThrow = true;
    throwErr = err;
  }

  await maybeCompleteCampaign(campaign.id);

  if (didThrow) throw throwErr; // let BullMQ retry per attempts policy
}

async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const pending = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ["pending", "queued"] } },
  });
  if (pending === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "completed", completedAt: new Date() },
    });
  }
}
