export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppMediaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "image" | "audio" | "video" | "document" | "sticker";
  [key: string]: unknown;
}

export interface WhatsAppInteractiveMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "interactive";
  interactive: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export type WhatsAppIncomingMessage =
  | WhatsAppTextMessage
  | WhatsAppMediaMessage
  | WhatsAppInteractiveMessage;

export interface WhatsAppContactProfile {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppStatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

export interface WhatsAppWebhookValue {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContactProfile[];
  messages?: WhatsAppIncomingMessage[];
  statuses?: WhatsAppStatusUpdate[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{ field: string; value: WhatsAppWebhookValue }>;
}

export interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: WhatsAppWebhookEntry[];
}

export interface SendTextOptions {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface SendTemplateOptions {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

export interface SendButtonsOptions {
  to: string;
  body: string;
  footer?: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface SendListOptions {
  to: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface SendResult {
  whatsappMessageId: string;
  raw: unknown;
}
