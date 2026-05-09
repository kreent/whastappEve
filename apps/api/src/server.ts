import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/auth.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { contactRoutes } from "./routes/contacts.js";
import { conversationRoutes } from "./routes/conversations.js";
import { debtRoutes } from "./routes/debts.js";
import { flowRoutes } from "./routes/flows.js";
import { metricsRoutes } from "./routes/metrics.js";
import { settingsRoutes } from "./routes/settings.js";
import { templateRoutes } from "./routes/templates.js";
import { webhookRoutes } from "./routes/webhook.js";
import { webhookComboPayRoutes } from "./routes/webhook-combopay.js";
import { webhookTelegramRoutes } from "./routes/webhook-telegram.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
          : undefined,
    },
    trustProxy: true,
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const buf = body as Buffer;
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
        const json = buf.length === 0 ? {} : JSON.parse(buf.toString("utf8"));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(sensible);
  await app.register(cookie, { secret: env.COOKIE_SECRET });

  app.get("/health", async () => ({ status: "ok", env: env.NODE_ENV }));

  app.get("/", async (_req, reply) => {
    reply.type("text/html").send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>WhatsApp Platform · API</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; color: #1f2937; line-height: 1.55; }
    h1 { margin-bottom: .25rem; }
    .tag { display: inline-block; background: #ecfdf5; color: #065f46; padding: 2px 10px; border-radius: 999px; font-size: .8rem; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: .9em; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: .55rem .75rem; border-bottom: 1px solid #e5e7eb; font-size: .92rem; }
    th { background: #f9fafb; font-weight: 600; }
    .muted { color: #6b7280; font-size: .9rem; }
  </style>
</head>
<body>
  <span class="tag">Fases 1-4 · API completa</span>
  <h1>WhatsApp Platform · API</h1>
  <p class="muted">Backend Fastify + Prisma + Redis + chatbot engine. La interfaz web llega en la Fase 5.</p>

  <h3>Webhook (Meta)</h3>
  <table>
    <thead><tr><th>Método</th><th>Ruta</th><th>Descripción</th></tr></thead>
    <tbody>
      <tr><td>GET</td><td><a href="/health"><code>/health</code></a></td><td>Healthcheck</td></tr>
      <tr><td>GET/POST</td><td><code>/webhook/whatsapp</code></td><td>Verificación + recepción firmada</td></tr>
    </tbody>
  </table>

  <h3>Auth</h3>
  <table>
    <tbody>
      <tr><td>POST</td><td><code>/api/auth/login</code></td><td>{ email, password } → cookie HttpOnly</td></tr>
      <tr><td>POST</td><td><code>/api/auth/logout</code></td><td>—</td></tr>
      <tr><td>GET</td><td><code>/api/auth/me</code></td><td>Usuario actual</td></tr>
    </tbody>
  </table>

  <h3>Conversaciones, contactos, flujos</h3>
  <table>
    <tbody>
      <tr><td>GET</td><td><code>/api/conversations</code></td><td>?scope=all|mine|unassigned|resolved&tag=...&search=...</td></tr>
      <tr><td>GET</td><td><code>/api/conversations/:id</code></td><td>Detalle + mensajes + notas</td></tr>
      <tr><td>POST</td><td><code>/api/conversations/:id/messages</code></td><td>Enviar mensaje manual</td></tr>
      <tr><td>PATCH</td><td><code>/api/conversations/:id</code></td><td>Asignar / cambiar estado</td></tr>
      <tr><td>POST</td><td><code>/api/conversations/:id/notes</code></td><td>Nota interna</td></tr>
      <tr><td>GET</td><td><code>/api/contacts</code></td><td>Lista con búsqueda y tags</td></tr>
      <tr><td>PATCH</td><td><code>/api/contacts/:id</code></td><td>Editar nombre / tags</td></tr>
      <tr><td>GET</td><td><code>/api/flows</code></td><td>Lista de flujos</td></tr>
      <tr><td>POST/PUT</td><td><code>/api/flows[/:id]</code></td><td>CRUD (admin)</td></tr>
    </tbody>
  </table>

  <p class="muted" style="margin-top:2rem">Todas las rutas <code>/api/*</code> requieren cookie de sesión válida.</p>
</body>
</html>`);
  });

  await app.register(webhookRoutes);
  await app.register(webhookTelegramRoutes);
  await app.register(webhookComboPayRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(contactRoutes);
  await app.register(flowRoutes);
  await app.register(templateRoutes);
  await app.register(metricsRoutes);
  await app.register(campaignRoutes);
  await app.register(debtRoutes);
  await app.register(settingsRoutes);

  return app;
}
