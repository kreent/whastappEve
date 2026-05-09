import { getWhatsAppConfig } from "./config.service.js";
import type {
  SendButtonsOptions,
  SendListOptions,
  SendResult,
  SendTemplateOptions,
  SendTextOptions,
} from "./whatsapp.types.js";

const GRAPH_BASE = "https://graph.facebook.com";

export class WhatsAppApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "WhatsAppApiError";
    this.status = status;
    this.body = body;
  }
}

export class WhatsAppService {
  async sendText({ to, body, previewUrl = false }: SendTextOptions): Promise<SendResult> {
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: previewUrl, body },
    });
  }

  async sendButtons({ to, body, footer, buttons }: SendButtonsOptions): Promise<SendResult> {
    if (buttons.length === 0 || buttons.length > 3) {
      throw new Error("WhatsApp interactive buttons require 1-3 entries");
    }
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  async sendList({
    to,
    body,
    footer,
    buttonText,
    sections,
  }: SendListOptions): Promise<SendResult> {
    return this.send({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          button: buttonText.slice(0, 20),
          sections: sections.map((s) => ({
            ...(s.title ? { title: s.title.slice(0, 24) } : {}),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    });
  }

  async sendTemplate({
    to,
    templateName,
    languageCode,
    components,
  }: SendTemplateOptions): Promise<SendResult> {
    return this.send({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  async markAsRead(whatsappMessageId: string): Promise<void> {
    await this.request({
      messaging_product: "whatsapp",
      status: "read",
      message_id: whatsappMessageId,
    });
  }

  private async send(payload: Record<string, unknown>): Promise<SendResult> {
    const json = await this.request(payload);
    const id = json?.messages?.[0]?.id as string | undefined;
    if (!id) {
      throw new WhatsAppApiError("WhatsApp response missing message id", 502, json);
    }
    return { whatsappMessageId: id, raw: json };
  }

  private async request(payload: Record<string, unknown>): Promise<any> {
    const cfg = await getWhatsAppConfig();
    const endpoint = `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      throw new WhatsAppApiError(
        `WhatsApp API error (${res.status})`,
        res.status,
        parsed,
      );
    }

    return parsed;
  }
}

export const whatsappService = new WhatsAppService();
