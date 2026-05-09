import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";
import {
  getComboPayConfig,
  getTelegramConfig,
  getWhatsAppConfig,
  redactComboPayConfig,
  redactTelegramConfig,
  redactWhatsAppConfig,
  setComboPayConfig,
  setTelegramConfig,
  setWhatsAppConfig,
} from "../services/config.service.js";
import { DEFAULT_BUSINESS_HOURS, getBusinessHours } from "../services/chatbot/business-hours.js";
import { listBanks as combopayListBanks, DEFAULT_BASE_URL as COMBOPAY_DEFAULT_URL } from "../services/combopay.service.js";
import {
  deleteWebhook as tgDeleteWebhook,
  getMe as tgGetMe,
  getWebhookInfo as tgGetWebhookInfo,
  setWebhook as tgSetWebhook,
} from "../services/telegram.service.js";

const whatsappSchema = z.object({
  phoneNumberId: z.string().min(1),
  businessAccountId: z.string().optional(),
  accessToken: z.string().min(1).optional(),
  appSecret: z.string().min(1).optional(),
  webhookVerifyToken: z.string().min(1),
  apiVersion: z.string().default("v21.0"),
});

const telegramSchema = z.object({
  botToken: z.string().min(20).optional(),
  botUsername: z.string().optional(),
  webhookSecretToken: z.string().optional(),
});

const combopaySchema = z.object({
  apiToken: z.string().min(10).optional(),
  baseUrl: z.string().url().optional(),
  defaultRedirectUrl: z.string().url().optional().nullable(),
  webhookSecretToken: z.string().optional().nullable(),
});

const businessHoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string(),
  schedule: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      openMinute: z.number().int().min(0).max(24 * 60),
      closeMinute: z.number().int().min(0).max(24 * 60),
    }),
  ),
  awayMessage: z.string().max(1024),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings/whatsapp", { preHandler: requireAdmin }, async () => {
    const cfg = await getWhatsAppConfig();
    return redactWhatsAppConfig(cfg);
  });

  app.put("/api/settings/whatsapp", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = whatsappSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const current = await getWhatsAppConfig();
    const next = {
      phoneNumberId: parsed.data.phoneNumberId,
      businessAccountId: parsed.data.businessAccountId ?? current.businessAccountId,
      accessToken: parsed.data.accessToken ?? current.accessToken,
      appSecret: parsed.data.appSecret ?? current.appSecret,
      webhookVerifyToken: parsed.data.webhookVerifyToken,
      apiVersion: parsed.data.apiVersion ?? current.apiVersion,
    };
    await setWhatsAppConfig(next);
    await audit({
      userId: req.user!.id,
      action: "settings.whatsapp.updated",
      metadata: { phoneNumberId: next.phoneNumberId },
    });
    reply.send(redactWhatsAppConfig(next));
  });

  app.get("/api/settings/telegram", { preHandler: requireAdmin }, async () => {
    const cfg = await getTelegramConfig();
    return redactTelegramConfig(cfg);
  });

  app.put("/api/settings/telegram", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = telegramSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const current = await getTelegramConfig();
    const next = {
      botToken: parsed.data.botToken ?? current?.botToken ?? "",
      botUsername: parsed.data.botUsername ?? current?.botUsername,
      webhookSecretToken: parsed.data.webhookSecretToken ?? current?.webhookSecretToken,
    };
    if (!next.botToken) {
      reply.code(400).send({ error: "missing_bot_token" });
      return;
    }
    await setTelegramConfig(next);
    await audit({ userId: req.user!.id, action: "settings.telegram.updated" });
    reply.send(redactTelegramConfig(next));
  });

  app.delete("/api/settings/telegram", { preHandler: requireAdmin }, async (req, reply) => {
    await setTelegramConfig(null);
    await audit({ userId: req.user!.id, action: "settings.telegram.deleted" });
    reply.send({ ok: true });
  });

  app.post(
    "/api/settings/telegram/test",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        const me = await tgGetMe();
        const info = await tgGetWebhookInfo();
        reply.send({ bot: me, webhook: info });
      } catch (err) {
        reply.code(502).send({ error: "telegram_error", message: (err as Error).message });
      }
    },
  );

  const setupWebhookSchema = z.object({
    url: z.string().url(),
  });
  app.post(
    "/api/settings/telegram/webhook",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = setupWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_input" });
        return;
      }
      const cfg = await getTelegramConfig();
      if (!cfg) {
        reply.code(400).send({ error: "telegram_not_configured" });
        return;
      }
      try {
        await tgSetWebhook(parsed.data.url, cfg.webhookSecretToken);
        const info = await tgGetWebhookInfo();
        reply.send({ ok: true, webhook: info });
      } catch (err) {
        reply.code(502).send({ error: "telegram_error", message: (err as Error).message });
      }
    },
  );

  app.delete(
    "/api/settings/telegram/webhook",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      try {
        await tgDeleteWebhook();
        reply.send({ ok: true });
      } catch (err) {
        reply.code(502).send({ error: "telegram_error", message: (err as Error).message });
      }
    },
  );

  app.get("/api/settings/combopay", { preHandler: requireAdmin }, async () => {
    const cfg = await getComboPayConfig();
    return redactComboPayConfig(cfg);
  });

  app.put("/api/settings/combopay", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = combopaySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const current = await getComboPayConfig();
    const next = {
      apiToken: parsed.data.apiToken ?? current?.apiToken ?? "",
      baseUrl: parsed.data.baseUrl ?? current?.baseUrl ?? COMBOPAY_DEFAULT_URL,
      defaultRedirectUrl:
        parsed.data.defaultRedirectUrl === null
          ? undefined
          : parsed.data.defaultRedirectUrl ?? current?.defaultRedirectUrl,
      webhookSecretToken:
        parsed.data.webhookSecretToken === null
          ? undefined
          : parsed.data.webhookSecretToken ?? current?.webhookSecretToken,
    };
    if (!next.apiToken) {
      reply.code(400).send({ error: "missing_api_token" });
      return;
    }
    await setComboPayConfig(next);
    await audit({ userId: req.user!.id, action: "settings.combopay.updated" });
    reply.send(redactComboPayConfig(next));
  });

  app.delete("/api/settings/combopay", { preHandler: requireAdmin }, async (req, reply) => {
    await setComboPayConfig(null);
    await audit({ userId: req.user!.id, action: "settings.combopay.deleted" });
    reply.send({ ok: true });
  });

  app.post("/api/settings/combopay/test", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      const banks = await combopayListBanks();
      reply.send({ ok: true, bankCount: banks.length, sampleBanks: banks.slice(0, 5) });
    } catch (err) {
      reply.code(502).send({ error: "combopay_error", message: (err as Error).message });
    }
  });

  app.get("/api/settings/business-hours", { preHandler: requireAuth }, async () => {
    return getBusinessHours();
  });

  app.put("/api/settings/business-hours", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = businessHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    await prisma.setting.upsert({
      where: { key: "business_hours" },
      create: { key: "business_hours", value: parsed.data as object },
      update: { value: parsed.data as object },
    });
    await audit({ userId: req.user!.id, action: "settings.business_hours.updated" });
    reply.send(parsed.data);
  });

  app.post(
    "/api/settings/business-hours/reset",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.setting.deleteMany({ where: { key: "business_hours" } });
      await audit({ userId: req.user!.id, action: "settings.business_hours.reset" });
      reply.send(DEFAULT_BUSINESS_HOURS);
    },
  );
}
