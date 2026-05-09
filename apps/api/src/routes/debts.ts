import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { enqueueManualReminderTick, enqueueRecipient } from "../queues/reminder.queue.js";
import { audit } from "../services/auth/audit.js";
import {
  createDebtWithInstallments,
  listInstallments,
  markInstallmentPaid,
} from "../services/debts.service.js";
import { AVAILABLE_FIELDS } from "../services/reminder-resolver.js";

const parameterMappingSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({ index: z.number().int().positive(), kind: z.literal("static"), value: z.string() }),
    z.object({
      index: z.number().int().positive(),
      kind: z.literal("context_field"),
      field: z.enum(AVAILABLE_FIELDS.map((f) => f.value) as [string, ...string[]]),
    }),
  ]),
);

const createDebtSchema = z.object({
  contactId: z.string().uuid(),
  description: z.string().max(200).optional(),
  totalAmount: z.number().positive().max(100_000_000_000),
  currency: z.string().length(3).default("COP"),
  installmentCount: z.number().int().min(1).max(60),
  paymentDayOfMonth: z.number().int().min(1).max(31),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentLink: z.string().url().optional(),
  templateId: z.string().uuid().optional(),
  parameterMapping: parameterMappingSchema.optional(),
});

const updateInstallmentSchema = z.object({
  status: z.enum(["pending", "paid", "cancelled" as never]).optional(),
  paymentLink: z.string().url().nullable().optional(),
});

export async function debtRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/debts/fields", { preHandler: requireAuth }, async () => AVAILABLE_FIELDS);

  app.get("/api/debts", { preHandler: requireAuth }, async (req) => {
    const q = req.query as { contactId?: string };
    return prisma.debt.findMany({
      where: q.contactId ? { contactId: q.contactId } : {},
      include: {
        contact: { select: { id: true, phoneNumber: true, profileName: true, name: true } },
        template: { select: { id: true, name: true, status: true } },
        installments: { orderBy: { number: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/debts/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const debt = await prisma.debt.findUnique({
        where: { id: req.params.id },
        include: {
          contact: true,
          template: true,
          installments: { orderBy: { number: "asc" } },
        },
      });
      if (!debt) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.send(debt);
    },
  );

  app.post("/api/debts", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createDebtSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
    if (!contact) {
      reply.code(400).send({ error: "contact_not_found" });
      return;
    }
    if (parsed.data.templateId) {
      const tpl = await prisma.template.findUnique({ where: { id: parsed.data.templateId } });
      if (!tpl) {
        reply.code(400).send({ error: "template_not_found" });
        return;
      }
    }
    const debt = await createDebtWithInstallments({
      contactId: parsed.data.contactId,
      description: parsed.data.description,
      totalAmount: parsed.data.totalAmount,
      currency: parsed.data.currency,
      installmentCount: parsed.data.installmentCount,
      paymentDayOfMonth: parsed.data.paymentDayOfMonth,
      firstDueDate: new Date(parsed.data.firstDueDate + "T00:00:00.000Z"),
      paymentLink: parsed.data.paymentLink,
      templateId: parsed.data.templateId,
      parameterMapping: parsed.data.parameterMapping,
    });
    await audit({
      userId: req.user!.id,
      action: "debt.created",
      entityType: "debt",
      entityId: debt.id,
      metadata: { totalAmount: parsed.data.totalAmount, installments: parsed.data.installmentCount },
    });
    reply.code(201).send(debt);
  });

  app.delete<{ Params: { id: string } }>(
    "/api/debts/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const debt = await prisma.debt.findUnique({ where: { id: req.params.id } });
      if (!debt) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      await prisma.debt.update({
        where: { id: req.params.id },
        data: { status: "cancelled" },
      });
      await audit({
        userId: req.user!.id,
        action: "debt.cancelled",
        entityType: "debt",
        entityId: req.params.id,
      });
      reply.send({ ok: true });
    },
  );

  app.get(
    "/api/installments",
    { preHandler: requireAuth },
    async (req) => {
      const q = req.query as { scope?: "today" | "overdue" | "upcoming" | "all"; contactId?: string };
      return listInstallments({ scope: q.scope, contactId: q.contactId });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/installments/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const parsed = updateInstallmentSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      if (parsed.data.status === "paid") {
        const result = await markInstallmentPaid(req.params.id);
        await audit({
          userId: req.user!.id,
          action: "installment.marked_paid",
          entityType: "installment",
          entityId: req.params.id,
        });
        reply.send(result);
        return;
      }
      const data: Record<string, unknown> = {};
      if (parsed.data.paymentLink !== undefined) data.paymentLink = parsed.data.paymentLink;
      const updated = await prisma.installment.update({
        where: { id: req.params.id },
        data,
      });
      reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/installments/:id/send-now",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const installment = await prisma.installment.findUnique({ where: { id: req.params.id } });
      if (!installment) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      await enqueueRecipient(installment.id);
      await audit({
        userId: req.user!.id,
        action: "installment.send_triggered",
        entityType: "installment",
        entityId: installment.id,
      });
      reply.send({ enqueued: true });
    },
  );

  app.post(
    "/api/debts/run-reminders",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await enqueueManualReminderTick();
      await audit({ userId: req.user!.id, action: "reminders.manual_tick" });
      reply.send({ ok: true, message: "Tick enqueued. Today's installments will be processed." });
    },
  );
}
