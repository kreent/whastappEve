import { Worker, type Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  resolveReminderParams,
  type ReminderParameterMapping,
} from "../services/reminder-resolver.js";
import { todayUtcDate } from "../services/debts.service.js";
import { whatsappService, WhatsAppApiError } from "../services/whatsapp.service.js";
import {
  REMINDER_QUEUE_NAME,
  enqueueRecipient,
  type ReminderRecipientData,
  type ReminderTickData,
} from "./reminder.queue.js";
import { getRedis } from "./redis.js";

export function startReminderWorker(logger: FastifyBaseLogger): Worker {
  const worker = new Worker(
    REMINDER_QUEUE_NAME,
    async (job: Job<ReminderTickData | ReminderRecipientData>) => {
      if (job.name === "tick") {
        await runDailyTick(logger.child({ jobId: job.id }));
      } else if (job.name === "send") {
        await sendOne((job.data as ReminderRecipientData).installmentId, logger.child({ jobId: job.id }));
      }
    },
    {
      connection: getRedis(),
      concurrency: 3,
    },
  );

  worker.on("completed", (job) =>
    logger.debug({ jobId: job.id, name: job.name }, "reminder job completed"),
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, name: job?.name, err: err.message }, "reminder job failed"),
  );
  worker.on("error", (err) => logger.error({ err: err.message }, "reminder worker error"));

  return worker;
}

async function runDailyTick(log: FastifyBaseLogger): Promise<void> {
  const today = todayUtcDate();
  const due = await prisma.installment.findMany({
    where: {
      status: { in: ["pending", "scheduled"] },
      dueDate: today,
    },
    select: { id: true },
  });

  // Mark overdue: anything still pending with dueDate < today and never reminded.
  await prisma.installment.updateMany({
    where: { status: { in: ["pending", "scheduled"] }, dueDate: { lt: today } },
    data: { status: "overdue" },
  });

  log.info({ count: due.length }, "daily reminder tick");

  for (const inst of due) {
    await enqueueRecipient(inst.id);
  }
}

async function sendOne(installmentId: string, log: FastifyBaseLogger): Promise<void> {
  const installment = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: { debt: { include: { contact: true, template: true } } },
  });
  if (!installment) {
    log.warn("installment not found, skipping");
    return;
  }
  if (installment.status === "paid" || installment.status === "sent") {
    log.debug({ status: installment.status }, "installment already handled");
    return;
  }
  if (installment.debt.status === "cancelled" || installment.debt.status === "paid") {
    return;
  }
  if (installment.debt.contact.optedOut) {
    await prisma.installment.update({
      where: { id: installment.id },
      data: { status: "failed", errorMessage: "contact opted out" },
    });
    return;
  }
  const template = installment.debt.template;
  if (!template) {
    await prisma.installment.update({
      where: { id: installment.id },
      data: { status: "failed", errorMessage: "debt has no template configured" },
    });
    return;
  }
  if (template.status !== "approved") {
    await prisma.installment.update({
      where: { id: installment.id },
      data: { status: "failed", errorMessage: `template '${template.name}' not approved` },
    });
    return;
  }

  const params = resolveReminderParams(
    installment.debt.parameterMapping as unknown as ReminderParameterMapping[],
    {
      contact: installment.debt.contact,
      debt: installment.debt,
      installment,
    },
  );
  const components = params.length
    ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
    : undefined;

  let didThrow = false;
  let throwErr: unknown = null;
  try {
    const result = await whatsappService.sendTemplate({
      to: installment.debt.contact.phoneNumber,
      templateName: template.name,
      languageCode: template.language,
      components,
    });
    await prisma.installment.update({
      where: { id: installment.id },
      data: {
        status: "sent",
        whatsappMessageId: result.whatsappMessageId,
        reminderSentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof WhatsAppApiError
        ? (err.body as { error?: { message?: string } })?.error?.message ?? err.message
        : (err as Error).message;
    await prisma.installment.update({
      where: { id: installment.id },
      data: { status: "failed", errorMessage },
    });
    didThrow = true;
    throwErr = err;
  }
  if (didThrow) throw throwErr;
}
