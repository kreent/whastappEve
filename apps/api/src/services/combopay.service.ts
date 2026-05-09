import { getComboPayConfig } from "./config.service.js";

export class ComboPayApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ComboPayApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ComboPayInvoiceInput {
  value: number;
  description: string;
  customer: {
    name: string;
    documentType?: string; // CC, NIT, CE, PP, etc.
    document?: string;
    email?: string;
    phoneNumber?: string;
  };
  custom?: string; // we use this for our installment id
  startBillingPeriod?: string; // YYYY-MM-DD
  endBillingPeriod?: string; // YYYY-MM-DD
  urlDataReturn?: string; // override webhook URL
  urlClientRedirect?: string; // override redirect after payment
}

export interface ComboPayInvoiceResult {
  invoiceId: string;
  paymentUrl: string;
  raw: unknown;
}

export interface ComboPayInvoiceStatus {
  invoiceId: string;
  status: string;
  paymentMethod?: string;
  raw: unknown;
}

export const DEFAULT_BASE_URL = "https://api.combopay.co";

async function request<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const cfg = await getComboPayConfig();
  if (!cfg) throw new ComboPayApiError("ComboPay not configured", 503, null);
  const url = `${cfg.baseUrl ?? DEFAULT_BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new ComboPayApiError(
      `ComboPay error (${res.status}): ${(parsed as { message?: string })?.message ?? "unknown"}`,
      res.status,
      parsed,
    );
  }
  return parsed as T;
}

/**
 * Create a payment-link invoice for a single installment.
 * ComboPay docs: POST /api/invoice-company-customer
 */
export async function createInvoice(
  input: ComboPayInvoiceInput,
  notificationUrl: string,
): Promise<ComboPayInvoiceResult> {
  const cfg = await getComboPayConfig();
  if (!cfg) throw new ComboPayApiError("ComboPay not configured", 503, null);
  const payload: Record<string, unknown> = {
    value: input.value,
    description: input.description,
    name: input.customer.name,
    typePaymentMethod: "payment_link",
    url_data_return: input.urlDataReturn ?? notificationUrl,
  };
  if (cfg.defaultRedirectUrl || input.urlClientRedirect) {
    payload.url_client_redirect = input.urlClientRedirect ?? cfg.defaultRedirectUrl;
  }
  if (input.custom) payload.custom = input.custom;
  if (input.startBillingPeriod) payload.start_billing_period = input.startBillingPeriod;
  if (input.endBillingPeriod) payload.end_billing_period = input.endBillingPeriod;
  if (input.customer.documentType) payload.document_type = input.customer.documentType;
  if (input.customer.document) payload.document = input.customer.document;
  if (input.customer.email) payload.email = input.customer.email;
  if (input.customer.phoneNumber) payload.phone_number = input.customer.phoneNumber;

  const json = (await request<Record<string, unknown>>(
    "POST",
    "/api/invoice-company-customer",
    payload,
  )) as Record<string, unknown>;

  // ComboPay's response shape (per docs) returns the invoice id and a payment URL.
  // We accept several common keys defensively.
  const invoiceId =
    (json.id as string) ??
    (json.invoice_id as string) ??
    ((json.data as { id?: string; invoice_id?: string } | undefined)?.id ??
      (json.data as { invoice_id?: string } | undefined)?.invoice_id) ??
    "";
  const paymentUrl =
    (json.payment_url as string) ??
    (json.url as string) ??
    (json.checkout_url as string) ??
    ((json.data as { payment_url?: string; url?: string } | undefined)?.payment_url ??
      (json.data as { url?: string } | undefined)?.url) ??
    "";

  if (!invoiceId || !paymentUrl) {
    throw new ComboPayApiError(
      "ComboPay response missing invoice_id or payment_url",
      502,
      json,
    );
  }
  return { invoiceId, paymentUrl, raw: json };
}

/** GET /api/invoice-company/{id}/status */
export async function getInvoiceStatus(invoiceId: string): Promise<ComboPayInvoiceStatus> {
  const json = (await request<Record<string, unknown>>(
    "GET",
    `/api/invoice-company/${encodeURIComponent(invoiceId)}/status`,
  )) as Record<string, unknown>;
  return {
    invoiceId,
    status:
      (json.transaction_state as string) ??
      (json.status as string) ??
      (json.state as string) ??
      "unknown",
    paymentMethod: (json.payment_method as string) ?? undefined,
    raw: json,
  };
}

/** GET /api/invoice-company/bank-list (used as a cheap "health check"). */
export async function listBanks(): Promise<Array<{ name: string; code: string }>> {
  const json = (await request<Record<string, unknown>>(
    "GET",
    "/api/invoice-company/bank-list",
  )) as { data?: Array<{ name: string; code: string }> };
  return json.data ?? [];
}
