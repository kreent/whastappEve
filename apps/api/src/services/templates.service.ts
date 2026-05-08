import { env } from "../config/env.js";
import { WhatsAppApiError } from "./whatsapp.service.js";

const GRAPH_BASE = "https://graph.facebook.com";

interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

export interface MetaTemplatePayload {
  name: string;
  language: string;
  category: string;
  components: MetaTemplateComponent[];
}

interface MetaCreateResponse {
  id: string;
  status: string;
  category: string;
}

interface MetaListResponse {
  data: Array<{
    id: string;
    name: string;
    language: string;
    status: string;
    category: string;
    components: MetaTemplateComponent[];
    rejected_reason?: string;
  }>;
}

function metaEndpoint(path: string): string {
  return `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}${path}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function submitTemplateToMeta(
  payload: MetaTemplatePayload,
): Promise<MetaCreateResponse> {
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is required to submit templates");
  }
  const res = await fetch(
    metaEndpoint(`/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`),
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
  );
  const json = (await res.json()) as MetaCreateResponse | { error?: unknown };
  if (!res.ok) {
    throw new WhatsAppApiError(`template submit failed (${res.status})`, res.status, json);
  }
  return json as MetaCreateResponse;
}

export async function listMetaTemplates(): Promise<MetaListResponse["data"]> {
  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is required to list templates");
  }
  const res = await fetch(
    metaEndpoint(
      `/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,language,status,category,components,rejected_reason&limit=100`,
    ),
    { headers: authHeaders() },
  );
  const json = (await res.json()) as MetaListResponse | { error?: unknown };
  if (!res.ok) {
    throw new WhatsAppApiError(`template list failed (${res.status})`, res.status, json);
  }
  return (json as MetaListResponse).data ?? [];
}

const STATUS_MAP: Record<string, "pending" | "approved" | "rejected" | "paused" | "disabled"> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
  IN_APPEAL: "pending",
  PENDING_DELETION: "disabled",
};

export function normalizeMetaStatus(metaStatus: string): "pending" | "approved" | "rejected" | "paused" | "disabled" {
  return STATUS_MAP[metaStatus.toUpperCase()] ?? "pending";
}
