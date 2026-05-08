import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";

const listSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  app.get("/api/contacts", async (req, reply) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const { search, tag, limit, cursor } = parsed.data;
    const where: Record<string, unknown> = {};
    if (tag) where.tags = { has: tag };
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { profileName: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = contacts.length > limit;
    const items = hasMore ? contacts.slice(0, limit) : contacts;
    reply.send({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  });

  app.get<{ Params: { id: string } }>("/api/contacts/:id", async (req, reply) => {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: {
        conversations: { orderBy: { updatedAt: "desc" }, take: 20 },
      },
    });
    if (!contact) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    reply.send(contact);
  });

  app.patch<{ Params: { id: string } }>("/api/contacts/:id", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input" });
      return;
    }
    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.tags !== undefined ? { tags: { set: parsed.data.tags } } : {}),
      },
    });
    await audit({
      userId: req.user!.id,
      action: "contact.updated",
      entityType: "contact",
      entityId: contact.id,
      metadata: { changes: parsed.data },
    });
    reply.send(contact);
  });
}
