import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";
import { withLock } from "../queues/lock.js";
import { maybeLinkTelegramStart } from "../routes/webhook-telegram.js";
import { ChannelSendError, sendToContact } from "./channels.js";
import { runEngine } from "./chatbot/engine.js";
import { recordInboundMessage, recordOutboundMessage, updateMessageStatus } from "./conversation.service.js";
import {
  isOptInMessage,
  isOptOutMessage,
  OPT_IN_CONFIRM,
  OPT_OUT_CONFIRM,
  setContactOptOut,
} from "./optout.js";
import * as telegram from "./telegram.service.js";
import { whatsappService, WhatsAppApiError } from "./whatsapp.service.js";
import type {
  WhatsAppContactProfile,
  WhatsAppIncomingMessage,
  WhatsAppStatusUpdate,
  WhatsAppWebhookPayload,
} from "./whatsapp.types.js";

interface ExtractedInput {
  text: string;
  selectionId?: string;
}

function extractInput(message: WhatsAppIncomingMessage): ExtractedInput {
  if (message.type === "text") return { text: message.text.body };
  if (message.type === "interactive") {
    const i = message.interactive;
    if (i.type === "button_reply") {
      return { text: i.button_reply?.title ?? "", selectionId: i.button_reply?.id };
    }
    if (i.type === "list_reply") {
      return { text: i.list_reply?.title ?? "", selectionId: i.list_reply?.id };
    }
  }
  return { text: `[${message.type}]` };
}

export async function handleWebhookPayload(
  payload: WhatsAppWebhookPayload,
  logger: FastifyBaseLogger,
): Promise<void> {
  if ((payload as { object?: string }).object === "telegram") {
    const update = (payload as unknown as {
      entry: Array<{ value: telegram.TelegramUpdate }>;
    }).entry[0]?.value;
    if (update) {
      await processTelegramUpdate(update, logger);
    }
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      const profilesByWaId = new Map<string, WhatsAppContactProfile>();
      for (const c of value.contacts ?? []) {
        profilesByWaId.set(c.wa_id, c);
      }

      for (const msg of value.messages ?? []) {
        await withLock(`wa:${msg.from}`, () =>
          processIncomingMessage(msg, profilesByWaId.get(msg.from), logger),
        );
      }

      for (const status of value.statuses ?? []) {
        await processStatus(status, logger);
        await updateCampaignRecipientStatus(status, logger);
      }
    }
  }
}

async function processIncomingMessage(
  msg: WhatsAppIncomingMessage,
  contactProfile: WhatsAppContactProfile | undefined,
  logger: FastifyBaseLogger,
): Promise<void> {
  const receivedAt = new Date(Number(msg.timestamp) * 1000);

  const { contact, conversation, isDuplicate } = await recordInboundMessage({
    phoneNumber: msg.from,
    profileName: contactProfile?.profile?.name,
    whatsappMessageId: msg.id,
    type: msg.type,
    content: JSON.parse(JSON.stringify(msg)),
    receivedAt,
  });

  if (isDuplicate) {
    logger.info({ whatsappMessageId: msg.id }, "duplicate inbound message ignored");
    return;
  }

  try {
    await whatsappService.markAsRead(msg.id);
  } catch (err) {
    logger.warn({ err, whatsappMessageId: msg.id }, "failed to mark message as read");
  }

  const { text, selectionId } = extractInput(msg);

  if (isOptOutMessage(text)) {
    await setContactOptOut(contact.id, true);
    await sendSystemReply(contact, conversation.id, OPT_OUT_CONFIRM, logger);
    logger.info({ contactId: contact.id }, "contact opted out");
    return;
  }
  if (isOptInMessage(text) && contact.optedOut) {
    await setContactOptOut(contact.id, false);
    await sendSystemReply(contact, conversation.id, OPT_IN_CONFIRM, logger);
    logger.info({ contactId: contact.id }, "contact opted in again");
    return;
  }

  const isFirstInbound = conversation.currentFlowNodeId == null && conversation.currentFlowId == null;

  await runEngine(
    {
      conversation,
      contact: {
        phoneNumber: contact.phoneNumber,
        profileName: contact.profileName,
        name: contact.name,
        preferredChannel: contact.preferredChannel,
        telegramChatId: contact.telegramChatId,
      },
      text,
      selectionId,
      isFirstInbound,
    },
    logger,
  );
}

async function processTelegramUpdate(
  update: telegram.TelegramUpdate,
  logger: FastifyBaseLogger,
): Promise<void> {
  const message = update.message ?? update.edited_message;
  if (!message) {
    logger.debug("telegram update without message, skipping");
    return;
  }
  const chat = message.chat;
  const text = message.text ?? "";

  await withLock(`tg:${chat.id}`, async () => {
    // /start <payload> deep-link → links the chat to a Contact.
    const linked = await maybeLinkTelegramStart(text, chat);
    if (linked) {
      const contact = await prisma.contact.findUnique({ where: { id: linked.contactId } });
      if (contact) {
        await sendSystemReply(
          contact,
          null,
          `¡Hola! Te confirmamos que ahora estás conectado por Telegram a tu cuenta. Te enviaremos avisos por aquí.`,
          logger,
        );
      }
      return;
    }

    let contact = await prisma.contact.findUnique({
      where: { telegramChatId: String(chat.id) },
    });
    if (!contact) {
      // Unlinked chat → create a placeholder contact with phone "tg:<chatId>".
      contact = await prisma.contact.create({
        data: {
          phoneNumber: `tg:${chat.id}`,
          name: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null,
          telegramChatId: String(chat.id),
          telegramUsername: chat.username,
          preferredChannel: "telegram",
          lastMessageAt: new Date(),
        },
      });
      logger.info({ chatId: chat.id, contactId: contact.id }, "telegram contact auto-created");
    } else {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastMessageAt: new Date() },
      });
    }

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, status: { in: ["open", "assigned", "pending", "bot_handling"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          status: "bot_handling",
          windowExpiresAt: null,
        },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        whatsappMessageId: `tg-${update.update_id}`,
        direction: "inbound",
        type: "text",
        content: { text: { body: text }, telegram: message } as object,
        status: "delivered",
      },
    });

    if (isOptOutMessage(text)) {
      await setContactOptOut(contact.id, true);
      await sendSystemReply(contact, conversation.id, OPT_OUT_CONFIRM, logger);
      return;
    }
    if (isOptInMessage(text) && contact.optedOut) {
      await setContactOptOut(contact.id, false);
      await sendSystemReply(contact, conversation.id, OPT_IN_CONFIRM, logger);
      return;
    }

    const isFirstInbound =
      conversation.currentFlowNodeId == null && conversation.currentFlowId == null;
    await runEngine(
      {
        conversation,
        contact: {
          phoneNumber: contact.phoneNumber,
          profileName: contact.profileName,
          name: contact.name,
          preferredChannel: contact.preferredChannel,
          telegramChatId: contact.telegramChatId,
        },
        text,
        isFirstInbound,
      },
      logger,
    );
  });
}

async function processStatus(status: WhatsAppStatusUpdate, logger: FastifyBaseLogger): Promise<void> {
  const errorMessage = status.errors?.[0]?.message ?? status.errors?.[0]?.title;
  await updateMessageStatus(status.id, status.status, errorMessage);
  logger.debug({ id: status.id, status: status.status }, "message status updated");
}

async function updateCampaignRecipientStatus(
  status: WhatsAppStatusUpdate,
  logger: FastifyBaseLogger,
): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { whatsappMessageId: status.id },
  });
  if (!recipient) return;

  const update: Record<string, unknown> = {};
  const now = new Date(Number(status.timestamp) * 1000);
  if (status.status === "delivered") {
    update.status = "delivered";
    update.deliveredAt = now;
  } else if (status.status === "read") {
    update.status = "read";
    update.readAt = now;
  } else if (status.status === "failed") {
    update.status = "failed";
    update.errorMessage = status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? "failed";
  }
  if (Object.keys(update).length > 0) {
    await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: update });
    logger.debug({ recipientId: recipient.id, status: status.status }, "campaign recipient updated");
  }
}

async function sendSystemReply(
  contact: { phoneNumber: string; preferredChannel: "whatsapp" | "telegram"; telegramChatId: string | null },
  conversationId: string | null,
  body: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  try {
    const result = await sendToContact(contact, { kind: "text", body });
    if (conversationId) {
      await recordOutboundMessage({
        conversationId,
        whatsappMessageId: result.externalMessageId,
        type: "text",
        content: { body },
        status: "sent",
        sentBy: "system",
      });
    }
  } catch (err) {
    if (err instanceof ChannelSendError || err instanceof WhatsAppApiError) {
      logger.warn({ err: (err as Error).message }, "system reply failed");
    } else {
      logger.warn({ err }, "system reply failed");
    }
    if (conversationId) {
      await recordOutboundMessage({
        conversationId,
        type: "text",
        content: { body },
        status: "failed",
        sentBy: "system",
      });
    }
  }
}
