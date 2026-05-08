import type { Contact, Conversation, Message, MessageDirection, MessageStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InboundMessageInput {
  phoneNumber: string;
  profileName?: string;
  whatsappMessageId: string;
  type: string;
  content: Prisma.InputJsonValue;
  receivedAt: Date;
}

export interface OutboundMessageInput {
  conversationId: string;
  whatsappMessageId?: string;
  type: string;
  content: Prisma.InputJsonValue;
  status?: MessageStatus;
  sentBy?: string;
}

export async function upsertContact(phoneNumber: string, profileName?: string): Promise<Contact> {
  return prisma.contact.upsert({
    where: { phoneNumber },
    create: {
      phoneNumber,
      profileName: profileName ?? null,
      lastMessageAt: new Date(),
    },
    update: {
      ...(profileName ? { profileName } : {}),
      lastMessageAt: new Date(),
    },
  });
}

export async function getOrCreateOpenConversation(contactId: string, receivedAt: Date): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: {
      contactId,
      status: { in: ["open", "assigned", "pending", "bot_handling"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.conversation.update({
      where: { id: existing.id },
      data: { windowExpiresAt: new Date(receivedAt.getTime() + WHATSAPP_WINDOW_MS) },
    });
  }

  return prisma.conversation.create({
    data: {
      contactId,
      status: "bot_handling",
      windowExpiresAt: new Date(receivedAt.getTime() + WHATSAPP_WINDOW_MS),
    },
  });
}

export async function recordInboundMessage(input: InboundMessageInput): Promise<{
  contact: Contact;
  conversation: Conversation;
  message: Message;
  isDuplicate: boolean;
}> {
  const existing = await prisma.message.findUnique({
    where: { whatsappMessageId: input.whatsappMessageId },
    include: { conversation: { include: { contact: true } } },
  });

  if (existing) {
    return {
      contact: existing.conversation.contact,
      conversation: existing.conversation,
      message: existing,
      isDuplicate: true,
    };
  }

  const contact = await upsertContact(input.phoneNumber, input.profileName);
  const conversation = await getOrCreateOpenConversation(contact.id, input.receivedAt);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      whatsappMessageId: input.whatsappMessageId,
      direction: "inbound" as MessageDirection,
      type: input.type,
      content: input.content,
      status: "delivered",
    },
  });

  return { contact, conversation, message, isDuplicate: false };
}

export async function recordOutboundMessage(input: OutboundMessageInput): Promise<Message> {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      whatsappMessageId: input.whatsappMessageId,
      direction: "outbound" as MessageDirection,
      type: input.type,
      content: input.content,
      status: input.status ?? "sent",
      sentBy: input.sentBy ?? "bot",
    },
  });
}

export async function updateMessageStatus(
  whatsappMessageId: string,
  status: MessageStatus,
  errorMessage?: string,
): Promise<void> {
  await prisma.message.updateMany({
    where: { whatsappMessageId },
    data: { status, ...(errorMessage ? { errorMessage } : {}) },
  });
}
