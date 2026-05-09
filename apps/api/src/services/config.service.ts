import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

export interface WhatsAppConfig {
  phoneNumberId: string;
  businessAccountId?: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  apiVersion: string;
}

export interface TelegramConfig {
  botToken: string;
  botUsername?: string; // e.g. "@my_bot"
  webhookSecretToken?: string; // Telegram's secret_token mechanism
}

const KEY_WHATSAPP = "whatsapp_config";
const KEY_TELEGRAM = "telegram_config";

let waCache: WhatsAppConfig | null | undefined;
let tgCache: TelegramConfig | null | undefined;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

function cacheStale(): boolean {
  return Date.now() - cacheLoadedAt > CACHE_TTL_MS;
}

export function invalidateConfigCache(): void {
  waCache = undefined;
  tgCache = undefined;
  cacheLoadedAt = 0;
}

function envWhatsApp(): WhatsAppConfig {
  return {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    apiVersion: env.WHATSAPP_API_VERSION,
  };
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  if (!cacheStale() && waCache !== undefined) {
    return waCache ?? envWhatsApp();
  }
  const row = await prisma.setting.findUnique({ where: { key: KEY_WHATSAPP } });
  cacheLoadedAt = Date.now();
  if (row) {
    waCache = row.value as unknown as WhatsAppConfig;
    return waCache;
  }
  waCache = null;
  return envWhatsApp();
}

export async function setWhatsAppConfig(cfg: WhatsAppConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: KEY_WHATSAPP },
    create: { key: KEY_WHATSAPP, value: cfg as object },
    update: { value: cfg as object },
  });
  invalidateConfigCache();
}

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  if (!cacheStale() && tgCache !== undefined) return tgCache;
  const row = await prisma.setting.findUnique({ where: { key: KEY_TELEGRAM } });
  cacheLoadedAt = Date.now();
  tgCache = row ? (row.value as unknown as TelegramConfig) : null;
  return tgCache;
}

export async function setTelegramConfig(cfg: TelegramConfig | null): Promise<void> {
  if (cfg === null) {
    await prisma.setting.deleteMany({ where: { key: KEY_TELEGRAM } });
  } else {
    await prisma.setting.upsert({
      where: { key: KEY_TELEGRAM },
      create: { key: KEY_TELEGRAM, value: cfg as object },
      update: { value: cfg as object },
    });
  }
  invalidateConfigCache();
}

/** Redact secrets so config can be returned by GET endpoints. */
export function redactWhatsAppConfig(cfg: WhatsAppConfig): Record<string, string | undefined | boolean> {
  return {
    phoneNumberId: cfg.phoneNumberId,
    businessAccountId: cfg.businessAccountId,
    apiVersion: cfg.apiVersion,
    webhookVerifyToken: cfg.webhookVerifyToken,
    hasAccessToken: !!cfg.accessToken && !cfg.accessToken.startsWith("placeholder"),
    hasAppSecret: !!cfg.appSecret && !cfg.appSecret.startsWith("placeholder"),
  };
}

export function redactTelegramConfig(cfg: TelegramConfig | null): Record<string, string | undefined | boolean> | null {
  if (!cfg) return null;
  return {
    botUsername: cfg.botUsername,
    hasBotToken: !!cfg.botToken,
    webhookSecretToken: cfg.webhookSecretToken,
  };
}
