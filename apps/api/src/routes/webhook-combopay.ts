import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import { getComboPayConfig } from "../services/config.service.js";
import { audit } from "../services/auth/audit.js";

interface ComboPayNotification {
  invoice_id?: string;
  transaction_state?: string;
  payment_method?: string;
  message?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone_number?: string;
  customer_document_number?: string;
  customer_document_type?: string;
  bank_process_date?: string;
  unique_transaction_code?: string;
  invoice_number?: string;
  custom?: string;
  tipo_respuesta?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

const APPROVED_STATES = new Set([
  "payment_approved",
  "approved",
  "paid",
  "transaction_approved",
]);
const FAILED_STATES = new Set([
  "payment_failed",
  "failed",
  "rejected",
  "declined",
  "cancelled",
]);

export async function webhookComboPayRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/webhook/combopay",
    async (req: FastifyRequest<{ Querystring: { secret?: string } }>, reply) => {
      const cfg = await getComboPayConfig();
      if (!cfg) {
        reply.code(503).send({ error: "combopay_not_configured" });
        return;
      }
      if (cfg.webhookSecretToken && req.query.secret !== cfg.webhookSecretToken) {
        req.log.warn("combopay webhook secret mismatch");
        reply.code(401).send({ error: "invalid_secret" });
        return;
      }

      const notif = req.body as ComboPayNotification;
      const invoiceId = notif.invoice_id;
      if (!invoiceId) {
        req.log.warn({ body: notif }, "combopay notification without invoice_id");
        reply.code(400).send({ error: "missing_invoice_id" });
        return;
      }

      // Reply early to avoid timeouts; processing below is fast.
      reply.code(200).send({ ok: true });

      try {
        const installment = await prisma.installment.findUnique({
          where: { combopayInvoiceId: invoiceId },
          include: { debt: { include: { contact: true } } },
        });
        if (!installment) {
          req.log.warn({ invoiceId }, "combopay notification for unknown invoice");
          return;
        }

        const stateRaw = (notif.transaction_state ?? "").toLowerCase();
        if (APPROVED_STATES.has(stateRaw)) {
          await prisma.installment.update({
            where: { id: installment.id },
            data: {
              status: "paid",
              paidAt: new Date(),
              combopayMetadata: notif as object,
              errorMessage: null,
            },
          });
          // Mark debt as paid if all installments are paid.
          const remaining = await prisma.installment.count({
            where: { debtId: installment.debtId, status: { not: "paid" } },
          });
          if (remaining === 0) {
            await prisma.debt.update({
              where: { id: installment.debtId },
              data: { status: "paid" },
            });
          }
          await audit({
            action: "combopay.payment_approved",
            entityType: "installment",
            entityId: installment.id,
            metadata: {
              invoiceId,
              paymentMethod: notif.payment_method,
              transactionCode: notif.unique_transaction_code,
            },
          });
          req.log.info({ installmentId: installment.id }, "installment marked paid via combopay");
        } else if (FAILED_STATES.has(stateRaw)) {
          await prisma.installment.update({
            where: { id: installment.id },
            data: {
              combopayMetadata: notif as object,
              errorMessage: notif.message ?? `combopay state: ${stateRaw}`,
            },
          });
          await audit({
            action: "combopay.payment_failed",
            entityType: "installment",
            entityId: installment.id,
            metadata: { invoiceId, state: stateRaw },
          });
        } else {
          // Unknown / pending state — just stash metadata.
          await prisma.installment.update({
            where: { id: installment.id },
            data: { combopayMetadata: notif as object },
          });
        }
      } catch (err) {
        req.log.error({ err }, "combopay notification processing failed");
      }
    },
  );

  app.get(
    "/webhook/combopay/return",
    async (req, reply) => {
      // Default landing page after the customer pays. Keep simple.
      const inv = (req.query as { invoice_id?: string }).invoice_id;
      reply.type("text/html").send(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Pago recibido</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:36px 40px;text-align:center;max-width:420px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  h1{font-size:20px;margin:0 0 8px}
  p{color:#475569;font-size:14px;margin:0}
  .check{font-size:48px;margin-bottom:12px}
</style>
</head>
<body>
  <div class="card">
    <div class="check">💛</div>
    <h1>¡Gracias por tu pago!</h1>
    <p>Estamos procesando tu transacción. Recibirás la confirmación por WhatsApp en unos minutos.</p>
    ${inv ? `<p style="margin-top:12px;color:#94a3b8;font-size:11px">Ref: ${inv}</p>` : ""}
  </div>
</body>
</html>`);
    },
  );
}
