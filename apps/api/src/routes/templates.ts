import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";
import {
  listMetaTemplates,
  normalizeMetaStatus,
  submitTemplateToMeta,
} from "../services/templates.service.js";
import { WhatsAppApiError } from "../services/whatsapp.service.js";

const componentSchema = z.object({
  type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS"]),
  format: z.enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).optional(),
  text: z.string().max(1024).optional(),
  buttons: z
    .array(
      z.object({
        type: z.enum(["URL", "PHONE_NUMBER", "QUICK_REPLY"]),
        text: z.string().min(1).max(25),
        url: z.string().url().optional(),
        phone_number: z.string().optional(),
      }),
    )
    .max(3)
    .optional(),
});

const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "name must be lowercase a-z, 0-9 or _"),
  language: z.string().min(2).max(20).default("es"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  components: z.array(componentSchema).min(1),
});

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/templates", { preHandler: requireAuth }, async () => {
    return prisma.template.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.get<{ Params: { id: string } }>(
    "/api/templates/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const tpl = await prisma.template.findUnique({ where: { id: req.params.id } });
      if (!tpl) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.send(tpl);
    },
  );

  app.post("/api/templates", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const tpl = await prisma.template.create({
      data: {
        name: data.name,
        language: data.language,
        category: data.category,
        components: data.components as object,
        status: "draft",
      },
    });
    await audit({
      userId: req.user!.id,
      action: "template.created",
      entityType: "template",
      entityId: tpl.id,
    });
    reply.code(201).send(tpl);
  });

  app.delete<{ Params: { id: string } }>(
    "/api/templates/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const tpl = await prisma.template.findUnique({ where: { id: req.params.id } });
      if (!tpl) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      if (tpl.status !== "draft" && tpl.status !== "rejected") {
        reply.code(409).send({
          error: "cannot_delete",
          message: "Solo se pueden borrar plantillas en estado draft o rejected.",
        });
        return;
      }
      await prisma.template.delete({ where: { id: tpl.id } });
      await audit({
        userId: req.user!.id,
        action: "template.deleted",
        entityType: "template",
        entityId: tpl.id,
      });
      reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/templates/:id/submit",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const tpl = await prisma.template.findUnique({ where: { id: req.params.id } });
      if (!tpl) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      if (tpl.status !== "draft" && tpl.status !== "rejected") {
        reply.code(409).send({ error: "already_submitted" });
        return;
      }
      try {
        const created = await submitTemplateToMeta({
          name: tpl.name,
          language: tpl.language,
          category: tpl.category,
          components: tpl.components as never,
        });
        const updated = await prisma.template.update({
          where: { id: tpl.id },
          data: {
            metaTemplateId: created.id,
            status: normalizeMetaStatus(created.status ?? "PENDING"),
            lastSyncedAt: new Date(),
            rejectionReason: null,
          },
        });
        await audit({
          userId: req.user!.id,
          action: "template.submitted",
          entityType: "template",
          entityId: tpl.id,
        });
        reply.send(updated);
      } catch (err) {
        const message =
          err instanceof WhatsAppApiError
            ? (err.body as { error?: { message?: string } })?.error?.message ?? err.message
            : (err as Error).message;
        req.log.error({ err }, "template submit error");
        reply.code(502).send({ error: "meta_error", message });
      }
    },
  );

  app.post(
    "/api/templates/sync",
    { preHandler: requireAdmin },
    async (req, reply) => {
      try {
        const remote = await listMetaTemplates();
        let updated = 0;
        for (const r of remote) {
          const existing = await prisma.template.findUnique({ where: { name: r.name } });
          const data = {
            language: r.language,
            category: r.category,
            status: normalizeMetaStatus(r.status),
            metaTemplateId: r.id,
            components: r.components as object,
            rejectionReason: r.rejected_reason ?? null,
            lastSyncedAt: new Date(),
          };
          if (existing) {
            await prisma.template.update({ where: { id: existing.id }, data });
          } else {
            await prisma.template.create({
              data: { ...data, name: r.name },
            });
          }
          updated++;
        }
        await audit({
          userId: req.user!.id,
          action: "template.synced",
          metadata: { count: updated },
        });
        reply.send({ synced: updated });
      } catch (err) {
        const message =
          err instanceof WhatsAppApiError
            ? (err.body as { error?: { message?: string } })?.error?.message ?? err.message
            : (err as Error).message;
        req.log.error({ err }, "template sync error");
        reply.code(502).send({ error: "meta_error", message });
      }
    },
  );
}
