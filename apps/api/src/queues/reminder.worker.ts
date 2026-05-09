import { Worker, type Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { ChannelSendError, renderTemplateText, sendToContact } from "../services/channels.js";
import {
  ComboPayApiError,
  createInvoice as combopayCreateInvoice,
} from "../services/combopay.service.js";
import { getComboPayConfig } from "../services/config.service.js";
import {
  resolveReminderParams,
  type ReminderParameterMapping,
} from "../services/reminder-resolver.js";
import { todayUtcDate } from "../services/debts.service.js";
import { WhatsAppApiError } from "../services/whatsapp.service.js";
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
  let installment = await prisma.installment.findUnique({
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

  // If ComboPay is configured and we don't have a payment link yet for this
  // installment, generate one now so {{paymentLink}} resolves to a real URL.
  const ready = await ensureComboPayLink(installment, log);

  const params = resolveReminderParams(
    ready.debt.parameterMapping as unknown as ReminderParameterMapping[],
    {
      contact: ready.debt.contact,
      debt: ready.debt,
      installment: ready,
    },
  );
  const components = params.length
    ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
    : undefined;

  const bodyText =
    (template.components as Array<{ type: string; text?: string }>).find((c) => c.type === "BODY")
      ?.text ?? "";
  const renderedText = renderTemplateText(bodyText, params);

  let didThrow = false;
  let throwErr: unknown = null;
  try {
    const result = await sendToContact(ready.debt.contact, {
      kind: "template",
      templateName: template.name,
      language: template.language,
      components,
      renderedText,
    });
    await prisma.installment.update({
      where: { id: ready.id },
      data: {
        status: "sent",
        whatsappMessageId: result.externalMessageId,
        reminderSentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof ChannelSendError
        ? err.message
        : err instanceof WhatsAppApiError
          ? (err.body as { error?: { message?: string } })?.error?.message ?? err.message
          : (err as Error).message;
    await prisma.installment.update({
      where: { id: ready.id },
      data: { status: "failed", errorMessage },
    });
    didThrow = true;
    throwErr = err;
  }
  if (didThrow) throw throwErr;
}

import type { Prisma } from "@prisma/client";
type FullInstallment = Prisma.InstallmentGetPayload<{
  include: { debt: { include: { contact: true; template: true } } };
}>;

async function ensureComboPayLink(
  installment: FullInstallment,
  log: FastifyBaseLogger,
): Promise<FullInstallment> {
  if (installment.paymentLink) return installment;
  const cfg = await getComboPayConfig();
  if (!cfg) return installment;
  try {
    const apiBase = process.env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`;
    const notificationUrl =
      `${apiBase}/webhook/combopay` +
      (cfg.webhookSecretToken ? `?secret=${encodeURIComponent(cfg.webhookSecretToken)}` : "");
    const result = await combopayCreateInvoice(
      {
        value: Number(installment.amount),
        description:
          (installment as unknown as { debt: { description: string | null; installmentCount: number } }).debt
            .description ??
          `Cuota ${installment.number} de ${(installment as unknown as { debt: { installmentCount: number } }).debt.installmentCount}`,
        custom: installment.id,
        startBillingPeriod: installment.dueDate.toISOString().slice(0, 10),
        endBillingPeriod: installment.dueDate.toISOString().slice(0, 10),
        customer: {
          name:
            installment.debt.contact.name ??
            installment.debt.contact.profileName ??
            "Cliente",
          phoneNumber: installment.debt.contact.phoneNumber,
        },
      },
      notificationUrl,
    );
    log.info({ installmentId: installment.id, invoiceId: result.invoiceId }, "combopay invoice created");
    return prisma.installment.update({
      where: { id: installment.id },
      data: {
        paymentLink: result.paymentUrl,
        combopayInvoiceId: result.invoiceId,
        combopayMetadata: result.raw as object,
      },
      include: { debt: { include: { contact: true, template: true } } },
    });
  } catch (err) {
    if (err instanceof ComboPayApiError) {
      log.warn({ status: err.status, body: err.body }, "combopay invoice creation failed");
    } else {
      log.warn({ err }, "combopay invoice creation failed (unknown)");
    }
    return installment;
  }
}
