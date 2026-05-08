import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { enqueueBroadcastRecipient } from "../queues/broadcast.queue.js";
import { audit } from "../services/auth/audit.js";
import {
  buildCampaignRecipients,
  previewCampaign,
  resolveParams,
  selectAudience,
  summarizeCampaign,
  type AudienceFilter,
  type ParameterMapping,
} from "../services/campaigns.service.js";

const parameterMappingSchema = z.discriminatedUnion("kind", [
  z.object({ index: z.number().int().positive(), kind: z.literal("static"), value: z.string() }),
  z.object({
    index: z.number().int().positive(),
    kind: z.literal("contact_field"),
    field: z.enum(["name", "profileName", "phoneNumber"]),
  }),
]);

const audienceFilterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("tag"), tag: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("ids"), ids: z.array(z.string().uuid()).min(1).max(10000) }),
]);

const createCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  templateId: z.string().uuid(),
  parameterMapping: z.array(parameterMappingSchema).max(20).default([]),
  audienceFilter: audienceFilterSchema,
});

const previewSchema = z.object({
  templateId: z.string().uuid(),
  parameterMapping: z.array(parameterMappingSchema).max(20).default([]),
  audienceFilter: audienceFilterSchema,
});

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns", { preHandler: requireAuth }, async () => {
    const campaigns = await prisma.campaign.findMany({
      include: { template: true, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" },
    });
    return campaigns;
  });

  app.get<{ Params: { id: string } }>(
    "/api/campaigns/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const campaign = await prisma.campaign.findUnique({
        where: { id: req.params.id },
        include: { template: true, createdBy: { select: { id: true, name: true } } },
      });
      if (!campaign) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const summary = await summarizeCampaign(campaign);
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id },
        include: { contact: { select: { id: true, phoneNumber: true, profileName: true, name: true } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      reply.send({ ...summary, recipients });
    },
  );

  app.post(
    "/api/campaigns/preview",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = previewSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
        return;
      }
      const template = await prisma.template.findUnique({ where: { id: parsed.data.templateId } });
      if (!template) {
        reply.code(404).send({ error: "template_not_found" });
        return;
      }
      const contacts = await selectAudience(parsed.data.audienceFilter as AudienceFilter);
      const samplePreview = previewCampaign(
        template,
        contacts.slice(0, 3).map((c) => ({
          resolvedParams: resolveParams(c, parsed.data.parameterMapping as ParameterMapping[]),
        })),
      );
      reply.send({
        audienceCount: contacts.length,
        samplePreview,
      });
    },
  );

  app.post("/api/campaigns", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const template = await prisma.template.findUnique({ where: { id: parsed.data.templateId } });
    if (!template) {
      reply.code(400).send({ error: "template_not_found" });
      return;
    }
    if (template.status !== "approved") {
      reply.code(409).send({
        error: "template_not_approved",
        message: `Plantilla en estado '${template.status}'. Aprueba en Meta antes de enviar.`,
      });
      return;
    }

    const contacts = await selectAudience(parsed.data.audienceFilter as AudienceFilter);
    if (contacts.length === 0) {
      reply.code(400).send({ error: "empty_audience" });
      return;
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: parsed.data.name,
        templateId: parsed.data.templateId,
        parameterMapping: parsed.data.parameterMapping as object,
        audienceFilter: parsed.data.audienceFilter as object,
        status: "draft",
        totalRecipients: contacts.length,
        createdById: req.user!.id,
      },
    });
    await buildCampaignRecipients(
      campaign.id,
      contacts,
      parsed.data.parameterMapping as ParameterMapping[],
    );

    await audit({
      userId: req.user!.id,
      action: "campaign.created",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: { totalRecipients: contacts.length },
    });

    reply.code(201).send(campaign);
  });

  app.post<{ Params: { id: string } }>(
    "/api/campaigns/:id/send",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      if (campaign.status !== "draft" && campaign.status !== "queued") {
        reply.code(409).send({ error: "invalid_state", currentStatus: campaign.status });
        return;
      }
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "sending", startedAt: new Date() },
      });
      const recipients = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id, status: "pending" },
        select: { id: true },
      });
      await prisma.campaignRecipient.updateMany({
        where: { campaignId: campaign.id, status: "pending" },
        data: { status: "queued" },
      });
      for (const r of recipients) {
        await enqueueBroadcastRecipient({ campaignId: campaign.id, recipientId: r.id });
      }
      await audit({
        userId: req.user!.id,
        action: "campaign.sent",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: { enqueued: recipients.length },
      });
      reply.send({ enqueued: recipients.length });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/campaigns/:id/cancel",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      if (campaign.status === "completed" || campaign.status === "cancelled") {
        reply.code(409).send({ error: "invalid_state" });
        return;
      }
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "cancelled", completedAt: new Date() },
      });
      await audit({
        userId: req.user!.id,
        action: "campaign.cancelled",
        entityType: "campaign",
        entityId: campaign.id,
      });
      reply.send({ ok: true });
    },
  );
}
