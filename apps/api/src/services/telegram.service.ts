import { getTelegramConfig } from "./config.service.js";

export class TelegramApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.body = body;
  }
}

export interface TelegramSendResult {
  messageId: number;
  chatId: number;
  raw: unknown;
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

const API_BASE = "https://api.telegram.org";

async function request<T = unknown>(
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const cfg = await getTelegramConfig();
  if (!cfg) {
    throw new TelegramApiError("Telegram not configured", 503, null);
  }
  const res = await fetch(`${API_BASE}/bot${cfg.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : "{}",
  });
  const text = await res.text();
  let parsed: { ok?: boolean; result?: T; description?: string } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { description: text };
  }
  if (!res.ok || !parsed.ok) {
    throw new TelegramApiError(
      `Telegram API error (${res.status}): ${parsed.description ?? "unknown"}`,
      res.status,
      parsed,
    );
  }
  return parsed.result as T;
}

export async function sendText(
  chatId: string | number,
  text: string,
  opts: { replyMarkup?: object } = {},
): Promise<TelegramSendResult> {
  const result = await request<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
  return { messageId: result.message_id, chatId: result.chat.id, raw: result };
}

export async function setWebhook(url: string, secretToken?: string): Promise<void> {
  await request("setWebhook", {
    url,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
}

export async function deleteWebhook(): Promise<void> {
  await request("deleteWebhook");
}

export async function getWebhookInfo(): Promise<{
  url: string;
  pending_update_count: number;
  last_error_message?: string;
}> {
  return request("getWebhookInfo");
}

export async function getMe(): Promise<{
  id: number;
  username: string;
  first_name: string;
}> {
  return request("getMe");
}

export function buildButtonsText(body: string, buttons: { title: string }[]): string {
  // Telegram fallback: render the body and a numbered list under it.
  if (buttons.length === 0) return body;
  const lines = [body, "", "Responde con el número de tu elección:"];
  buttons.forEach((b, i) => lines.push(`${i + 1}) ${b.title}`));
  return lines.join("\n");
}

export function parseNumericReply(
  text: string | undefined,
  optionCount: number,
): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (n >= 1 && n <= optionCount) return n - 1;
  return null;
}
