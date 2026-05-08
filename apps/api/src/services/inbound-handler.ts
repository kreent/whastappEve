import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../db/prisma.js";
import { withLock } from "../queues/lock.js";
import { runEngine } from "./chatbot/engine.js";
import { recordInboundMessage, recordOutboundMessage, updateMessageStatus } from "./conversation.service.js";
import {
  isOptInMessage,
  isOptOutMessage,
  OPT_IN_CONFIRM,
  OPT_OUT_CONFIRM,
  setContactOptOut,
} from "./optout.js";
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

  // Opt-out / opt-in handling — short-circuits the engine.
  if (isOptOutMessage(text)) {
    await setContactOptOut(contact.id, true);
    await sendSystemReply(conversation.id, contact.phoneNumber, OPT_OUT_CONFIRM, logger);
    logger.info({ contactId: contact.id }, "contact opted out");
    return;
  }
  if (isOptInMessage(text) && contact.optedOut) {
    await setContactOptOut(contact.id, false);
    await sendSystemReply(conversation.id, contact.phoneNumber, OPT_IN_CONFIRM, logger);
    logger.info({ contactId: contact.id }, "contact opted in again");
    return;
  }

  const isFirstInbound = conversation.currentFlowNodeId == null && conversation.currentFlowId == null;

  await runEngine(
    {
      conversation,
      contact: { phoneNumber: contact.phoneNumber, profileName: contact.profileName, name: contact.name },
      text,
      selectionId,
      isFirstInbound,
    },
    logger,
  );
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
  conversationId: string,
  phoneNumber: string,
  body: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  try {
    const result = await whatsappService.sendText({ to: phoneNumber, body });
    await recordOutboundMessage({
      conversationId,
      whatsappMessageId: result.whatsappMessageId,
      type: "text",
      content: { body },
      status: "sent",
      sentBy: "system",
    });
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      logger.warn({ status: err.status, body: err.body }, "system reply failed");
    } else {
      logger.warn({ err }, "system reply failed");
    }
    await recordOutboundMessage({
      conversationId,
      type: "text",
      content: { body },
      status: "failed",
      sentBy: "system",
    });
  }
}
