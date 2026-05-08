import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { enqueueInbound } from "../queues/inbound.queue.js";
import { verifySignature } from "../services/webhook-signature.js";
import type { WhatsAppWebhookPayload } from "../services/whatsapp.types.js";

interface VerifyQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

function deriveJobId(payload: WhatsAppWebhookPayload): string | undefined {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const firstMsg = change.value.messages?.[0]?.id;
      if (firstMsg) return `msg-${firstMsg}`;
      const firstStatus = change.value.statuses?.[0];
      if (firstStatus) return `status-${firstStatus.id}-${firstStatus.status}`;
    }
  }
  return undefined;
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: VerifyQuery }>("/webhook/whatsapp", async (req, reply) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
      reply.code(200).type("text/plain").send(challenge);
      return;
    }
    reply.code(403).send({ error: "verification_failed" });
  });

  app.post("/webhook/whatsapp", async (req: FastifyRequest, reply) => {
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!rawBody || !verifySignature(env.WHATSAPP_APP_SECRET, rawBody, signature)) {
      req.log.warn({ signature }, "webhook signature invalid");
      reply.code(401).send({ error: "invalid_signature" });
      return;
    }

    const payload = req.body as WhatsAppWebhookPayload;
    const jobId = deriveJobId(payload);

    try {
      await enqueueInbound(
        { payload, receivedAt: new Date().toISOString() },
        jobId,
      );
      req.log.info({ jobId }, "inbound job enqueued");
    } catch (err) {
      req.log.error({ err }, "failed to enqueue inbound job");
      reply.code(503).send({ error: "queue_unavailable" });
      return;
    }

    reply.code(200).send({ ok: true });
  });
}
