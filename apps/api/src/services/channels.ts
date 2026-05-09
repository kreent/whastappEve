// Channel dispatcher: picks WhatsApp or Telegram for outbound delivery
// based on contact.preferredChannel + availability.

import * as telegram from "./telegram.service.js";
import { whatsappService, WhatsAppApiError } from "./whatsapp.service.js";

export type Channel = "whatsapp" | "telegram";

export interface SendResult {
  channel: Channel;
  externalMessageId: string;
}

export class ChannelSendError extends Error {
  channel: Channel;
  cause: unknown;
  constructor(message: string, channel: Channel, cause: unknown) {
    super(message);
    this.name = "ChannelSendError";
    this.channel = channel;
    this.cause = cause;
  }
}

export interface ContactLike {
  phoneNumber: string;
  preferredChannel: Channel;
  telegramChatId: string | null;
}

/**
 * Returns the channel that should be used to reach the contact.
 * Falls back to whatsapp if preferredChannel is telegram but no chat is linked.
 */
export function pickChannel(contact: ContactLike): Channel {
  if (contact.preferredChannel === "telegram" && contact.telegramChatId) {
    return "telegram";
  }
  return "whatsapp";
}

/* ---------- Outbound interfaces ---------- */

export interface OutboundText {
  kind: "text";
  body: string;
}

export interface OutboundButtons {
  kind: "buttons";
  body: string;
  footer?: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface OutboundList {
  kind: "list";
  body: string;
  footer?: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface OutboundTemplate {
  kind: "template";
  templateName: string;
  language: string;
  components?: unknown[];
  /** Plain-text fallback used when sending via Telegram. */
  renderedText?: string;
}

export type Outbound = OutboundText | OutboundButtons | OutboundList | OutboundTemplate;

/* ---------- Dispatcher ---------- */

export async function sendToContact(contact: ContactLike, msg: Outbound): Promise<SendResult> {
  const channel = pickChannel(contact);
  if (channel === "whatsapp") return sendWhatsApp(contact, msg);
  return sendTelegram(contact, msg);
}

async function sendWhatsApp(contact: ContactLike, msg: Outbound): Promise<SendResult> {
  try {
    if (msg.kind === "text") {
      const r = await whatsappService.sendText({ to: contact.phoneNumber, body: msg.body });
      return { channel: "whatsapp", externalMessageId: r.whatsappMessageId };
    }
    if (msg.kind === "buttons") {
      const r = await whatsappService.sendButtons({
        to: contact.phoneNumber,
        body: msg.body,
        footer: msg.footer,
        buttons: msg.buttons,
      });
      return { channel: "whatsapp", externalMessageId: r.whatsappMessageId };
    }
    if (msg.kind === "list") {
      const r = await whatsappService.sendList({
        to: contact.phoneNumber,
        body: msg.body,
        footer: msg.footer,
        buttonText: msg.buttonText,
        sections: msg.sections,
      });
      return { channel: "whatsapp", externalMessageId: r.whatsappMessageId };
    }
    // template
    const r = await whatsappService.sendTemplate({
      to: contact.phoneNumber,
      templateName: msg.templateName,
      languageCode: msg.language,
      components: msg.components as object[] | undefined,
    });
    return { channel: "whatsapp", externalMessageId: r.whatsappMessageId };
  } catch (err) {
    if (err instanceof WhatsAppApiError) {
      throw new ChannelSendError(err.message, "whatsapp", err);
    }
    throw new ChannelSendError((err as Error).message, "whatsapp", err);
  }
}

async function sendTelegram(contact: ContactLike, msg: Outbound): Promise<SendResult> {
  if (!contact.telegramChatId) {
    throw new ChannelSendError("Contact has no Telegram chat linked", "telegram", null);
  }
  let text: string;
  if (msg.kind === "text") {
    text = msg.body;
  } else if (msg.kind === "buttons") {
    text = telegram.buildButtonsText(msg.body, msg.buttons);
  } else if (msg.kind === "list") {
    const allRows = msg.sections.flatMap((s) => s.rows);
    text = telegram.buildButtonsText(msg.body, allRows);
  } else {
    // template — Telegram has no templates, send the rendered text.
    text =
      msg.renderedText ??
      `[plantilla: ${msg.templateName}] (sin renderizado disponible)`;
  }
  try {
    const r = await telegram.sendText(contact.telegramChatId, text);
    return { channel: "telegram", externalMessageId: `tg-${r.messageId}` };
  } catch (err) {
    throw new ChannelSendError((err as Error).message, "telegram", err);
  }
}

/* ---------- Helpers ---------- */

/** Renders a WhatsApp template body locally (substitutes {{1}}, {{2}}, ...). */
export function renderTemplateText(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}
