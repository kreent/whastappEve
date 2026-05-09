import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";
import {
  ChannelSendError,
  renderTemplateText,
  sendToContact,
} from "../services/channels.js";
import { recordOutboundMessage } from "../services/conversation.service.js";
import { WhatsAppApiError } from "../services/whatsapp.service.js";

const filterSchema = z.object({
  scope: z.enum(["all", "mine", "unassigned", "resolved", "pending", "bot"]).default("all"),
  tag: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

const sendMessageSchema = z.union([
  z.object({
    kind: z.literal("text").optional().default("text"),
    body: z.string().min(1).max(4096),
  }),
  z.object({
    kind: z.literal("template"),
    templateId: z.string().uuid(),
    parameters: z.array(z.string()).optional(),
  }),
]);

const updateConversationSchema = z.object({
  status: z.enum(["open", "assigned", "pending", "resolved", "bot_handling"]).optional(),
  assignedAgentId: z.string().uuid().nullable().optional(),
});

const noteSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/conversations", async (req, reply) => {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const { scope, tag, search, limit, cursor } = parsed.data;
    const me = req.user!;

    const where: Record<string, unknown> = {};
    if (scope === "mine") where.assignedAgentId = me.id;
    else if (scope === "unassigned") where.assignedAgentId = null;
    else if (scope === "resolved") where.status = "resolved";
    else if (scope === "pending") where.status = "pending";
    else if (scope === "bot") where.status = "bot_handling";

    // Agents only see assigned-to-them or unassigned
    if (me.role === "agent" && scope === "all") {
      where.OR = [{ assignedAgentId: me.id }, { assignedAgentId: null }];
    }

    if (tag) where.contact = { tags: { has: tag } };
    if (search) {
      where.contact = {
        ...(where.contact as object | undefined),
        OR: [
          { phoneNumber: { contains: search } },
          { profileName: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;
    reply.send({
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    });
  });

  app.get<{ Params: { id: string } }>("/api/conversations/:id", async (req, reply) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
        currentFlow: true,
        notes: { include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!conversation) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!canAccessConversation(req.user!, conversation.assignedAgentId)) {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
    const windowOpen = conversation.windowExpiresAt
      ? conversation.windowExpiresAt > new Date()
      : false;
    reply.send({ ...conversation, windowOpen });
  });

  app.post<{ Params: { id: string } }>("/api/conversations/:id/messages", async (req, reply) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true },
    });
    if (!conversation) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!canAccessConversation(req.user!, conversation.assignedAgentId)) {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
    const windowOpen = conversation.windowExpiresAt
      ? conversation.windowExpiresAt > new Date()
      : false;
    const isTemplate = parsed.data.kind === "template";
    if (!windowOpen && !isTemplate) {
      reply.code(409).send({
        error: "window_closed",
        message: "La ventana de 24h de WhatsApp expiró. Usa una plantilla aprobada.",
      });
      return;
    }

    let whatsappMessageId: string | undefined;
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | undefined;
    let messageType = "text";
    let messageContent: Record<string, unknown> = {};

    try {
      if (parsed.data.kind === "template") {
        const tpl = await prisma.template.findUnique({ where: { id: parsed.data.templateId } });
        if (!tpl) {
          reply.code(400).send({ error: "template_not_found" });
          return;
        }
        if (tpl.status !== "approved") {
          reply.code(409).send({
            error: "template_not_approved",
            message: `Plantilla en estado '${tpl.status}'. Solo plantillas aprobadas se pueden enviar.`,
          });
          return;
        }
        const params = parsed.data.parameters ?? [];
        const components = params.length
          ? [
              {
                type: "body",
                parameters: params.map((text) => ({ type: "text", text })),
              },
            ]
          : undefined;
        const bodyText =
          (tpl.components as Array<{ type: string; text?: string }>).find((c) => c.type === "BODY")
            ?.text ?? "";
        const renderedText = renderTemplateText(bodyText, params);
        const result = await sendToContact(conversation.contact, {
          kind: "template",
          templateName: tpl.name,
          language: tpl.language,
          components,
          renderedText,
        });
        whatsappMessageId = result.externalMessageId;
        messageType = "template";
        messageContent = {
          templateId: tpl.id,
          templateName: tpl.name,
          parameters: params,
          channel: result.channel,
        };
      } else {
        const result = await sendToContact(conversation.contact, {
          kind: "text",
          body: parsed.data.body,
        });
        whatsappMessageId = result.externalMessageId;
        messageContent = { body: parsed.data.body, channel: result.channel };
      }
    } catch (err) {
      status = "failed";
      if (err instanceof ChannelSendError) {
        errorMessage = err.message;
      } else if (err instanceof WhatsAppApiError) {
        errorMessage = (err.body as { error?: { message?: string } })?.error?.message ?? err.message;
      } else {
        errorMessage = (err as Error).message;
      }
      req.log.error({ err: errorMessage }, "manual send failed");
    }

    const message = await recordOutboundMessage({
      conversationId: conversation.id,
      whatsappMessageId,
      type: messageType,
      content: messageContent as object,
      status,
      sentBy: req.user!.id,
    });

    // Auto-take: if conversation is unassigned or in bot_handling/pending,
    // mark it as assigned to this agent (they're now handling it).
    const shouldAssign =
      conversation.assignedAgentId == null ||
      conversation.status === "bot_handling" ||
      conversation.status === "pending";
    if (shouldAssign) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          assignedAgentId: req.user!.id,
          status: "assigned",
          currentFlowId: null,
          currentFlowNodeId: null,
        },
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    await audit({
      userId: req.user!.id,
      action: "conversation.message_sent",
      entityType: "conversation",
      entityId: conversation.id,
      metadata: { messageId: message.id, status },
    });

    if (status === "failed") {
      reply.code(502).send({ error: "send_failed", message: errorMessage, dbMessage: message });
      return;
    }
    reply.code(201).send({ message });
  });

  app.patch<{ Params: { id: string } }>("/api/conversations/:id", async (req, reply) => {
    const parsed = updateConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const existing = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { id: true, assignedAgentId: true, status: true },
    });
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!canAccessConversation(req.user!, existing.assignedAgentId)) {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.assignedAgentId !== undefined) data.assignedAgentId = parsed.data.assignedAgentId;

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data,
      include: { contact: true },
    });

    await audit({
      userId: req.user!.id,
      action: "conversation.updated",
      entityType: "conversation",
      entityId: req.params.id,
      metadata: { changes: parsed.data },
    });

    reply.send(updated);
  });

  app.post<{ Params: { id: string } }>("/api/conversations/:id/notes", async (req, reply) => {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { id: true, assignedAgentId: true },
    });
    if (!conversation) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    if (!canAccessConversation(req.user!, conversation.assignedAgentId)) {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
    const note = await prisma.note.create({
      data: {
        conversationId: conversation.id,
        userId: req.user!.id,
        content: parsed.data.content,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    reply.code(201).send(note);
  });
}

function canAccessConversation(user: { id: string; role: string }, assignedAgentId: string | null): boolean {
  if (user.role === "admin") return true;
  return assignedAgentId === null || assignedAgentId === user.id;
}
