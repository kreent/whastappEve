import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import { enqueueInbound } from "../queues/inbound.queue.js";
import { getTelegramConfig } from "../services/config.service.js";
import type { TelegramUpdate } from "../services/telegram.service.js";

const HEADER_SECRET = "x-telegram-bot-api-secret-token";

export async function webhookTelegramRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhook/telegram", async (req: FastifyRequest, reply) => {
    const cfg = await getTelegramConfig();
    if (!cfg) {
      reply.code(503).send({ error: "telegram_not_configured" });
      return;
    }
    if (cfg.webhookSecretToken) {
      const got = req.headers[HEADER_SECRET];
      if (got !== cfg.webhookSecretToken) {
        req.log.warn("telegram webhook secret mismatch");
        reply.code(401).send({ error: "invalid_secret" });
        return;
      }
    }

    const update = req.body as TelegramUpdate;
    const jobId = update?.update_id ? `tg-${update.update_id}` : undefined;

    try {
      await enqueueInbound(
        {
          payload: { object: "telegram", entry: [{ value: update }] } as never,
          receivedAt: new Date().toISOString(),
        },
        jobId,
      );
      req.log.info({ jobId }, "telegram update enqueued");
    } catch (err) {
      req.log.error({ err }, "failed to enqueue telegram update");
    }

    reply.code(200).send({ ok: true });
  });
}

/**
 * Link a Telegram chat to an existing Contact via the /start <contactId> deep link.
 * Returns the linked contact, or null if the start payload didn't match.
 */
export async function maybeLinkTelegramStart(
  text: string | undefined,
  chat: { id: number; username?: string },
): Promise<{ contactId: string } | null> {
  if (!text) return null;
  const trimmed = text.trim();
  const m = trimmed.match(/^\/start\s+(\S+)/);
  if (!m) return null;
  const payload = m[1];
  // payload can be a contact UUID or a phone number
  let contact = null;
  if (/^[0-9a-fA-F-]{36}$/.test(payload)) {
    contact = await prisma.contact.findUnique({ where: { id: payload } });
  } else if (/^\d{8,18}$/.test(payload)) {
    contact = await prisma.contact.findUnique({ where: { phoneNumber: payload } });
  }
  if (!contact) return null;
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      telegramChatId: String(chat.id),
      telegramUsername: chat.username,
    },
  });
  return { contactId: contact.id };
}
