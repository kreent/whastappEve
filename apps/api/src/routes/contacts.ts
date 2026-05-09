import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";
import { normalizePhone, parseCsv } from "../services/csv.js";

const listSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  optedOut: z.boolean().optional(),
  preferredChannel: z.enum(["whatsapp", "telegram"]).optional(),
  telegramChatId: z.string().nullable().optional(),
});

const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000), // 2 MB cap
  defaultTags: z.array(z.string().min(1).max(40)).max(20).optional(),
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
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.tags !== undefined) data.tags = { set: parsed.data.tags };
    if (parsed.data.optedOut !== undefined) {
      data.optedOut = parsed.data.optedOut;
      data.optedOutAt = parsed.data.optedOut ? new Date() : null;
    }
    if (parsed.data.preferredChannel !== undefined) {
      data.preferredChannel = parsed.data.preferredChannel;
    }
    if (parsed.data.telegramChatId !== undefined) {
      data.telegramChatId = parsed.data.telegramChatId;
    }
    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data,
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

  app.post(
    "/api/contacts/import",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = importSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
        return;
      }
      const rows = parseCsv(parsed.data.csv);
      if (rows.length < 1) {
        reply.code(400).send({ error: "empty_csv" });
        return;
      }

      // Detect header. Accept: phone (required), name (optional), tags (optional, comma-separated within cell)
      const headerRow = rows[0].map((h) => h.toLowerCase().trim());
      const phoneIdx = headerRow.findIndex((h) => h === "phone" || h === "telefono" || h === "teléfono");
      const nameIdx = headerRow.findIndex((h) => h === "name" || h === "nombre");
      const tagsIdx = headerRow.findIndex((h) => h === "tags" || h === "etiquetas");
      if (phoneIdx === -1) {
        reply.code(400).send({
          error: "missing_phone_column",
          message: "El CSV debe tener una columna 'phone' (o 'telefono').",
        });
        return;
      }

      const defaultTags = parsed.data.defaultTags ?? [];
      const created: string[] = [];
      const updated: string[] = [];
      const skipped: Array<{ row: number; reason: string }> = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawPhone = row[phoneIdx]?.trim() ?? "";
        const phone = normalizePhone(rawPhone);
        if (!phone) {
          skipped.push({ row: i + 1, reason: `invalid phone: ${rawPhone}` });
          continue;
        }
        const name = nameIdx >= 0 ? row[nameIdx]?.trim() || null : null;
        const cellTags =
          tagsIdx >= 0 && row[tagsIdx]
            ? row[tagsIdx]
                .split(/[,;|]/)
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
        const tags = Array.from(new Set([...defaultTags, ...cellTags]));

        const existing = await prisma.contact.findUnique({ where: { phoneNumber: phone } });
        if (existing) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              ...(name && !existing.name ? { name } : {}),
              tags: { set: Array.from(new Set([...existing.tags, ...tags])) },
            },
          });
          updated.push(phone);
        } else {
          await prisma.contact.create({
            data: {
              phoneNumber: phone,
              name,
              tags,
            },
          });
          created.push(phone);
        }
      }

      await audit({
        userId: req.user!.id,
        action: "contact.imported",
        metadata: { created: created.length, updated: updated.length, skipped: skipped.length },
      });

      reply.send({
        total: rows.length - 1,
        created: created.length,
        updated: updated.length,
        skipped,
      });
    },
  );
}
