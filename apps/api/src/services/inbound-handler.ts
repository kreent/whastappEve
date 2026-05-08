import type { FastifyBaseLogger } from "fastify";
import { withLock } from "../queues/lock.js";
import { runEngine } from "./chatbot/engine.js";
import { recordInboundMessage, updateMessageStatus } from "./conversation.service.js";
import { whatsappService } from "./whatsapp.service.js";
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
