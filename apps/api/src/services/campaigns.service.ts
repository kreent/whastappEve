import type { Campaign, CampaignRecipient, Contact, Template } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type ParameterMapping =
  | { index: number; kind: "static"; value: string }
  | { index: number; kind: "contact_field"; field: "name" | "profileName" | "phoneNumber" };

export type AudienceFilter =
  | { kind: "all" }
  | { kind: "tag"; tag: string }
  | { kind: "ids"; ids: string[] };

export function resolveParams(
  contact: Pick<Contact, "name" | "profileName" | "phoneNumber">,
  mapping: ParameterMapping[],
): string[] {
  const sorted = [...mapping].sort((a, b) => a.index - b.index);
  return sorted.map((m) => {
    if (m.kind === "static") return m.value;
    const v =
      m.field === "name"
        ? contact.name
        : m.field === "profileName"
        ? contact.profileName ?? contact.name
        : contact.phoneNumber;
    return v ?? "";
  });
}

export async function selectAudience(filter: AudienceFilter): Promise<Contact[]> {
  if (filter.kind === "all") {
    return prisma.contact.findMany({ where: { optedOut: false } });
  }
  if (filter.kind === "tag") {
    return prisma.contact.findMany({
      where: { optedOut: false, tags: { has: filter.tag } },
    });
  }
  return prisma.contact.findMany({
    where: { optedOut: false, id: { in: filter.ids } },
  });
}

export async function buildCampaignRecipients(
  campaignId: string,
  contacts: Contact[],
  mapping: ParameterMapping[],
): Promise<CampaignRecipient[]> {
  const data = contacts.map((c) => ({
    campaignId,
    contactId: c.id,
    resolvedParams: resolveParams(c, mapping) as object,
    status: "pending" as const,
  }));
  await prisma.campaignRecipient.createMany({ data, skipDuplicates: true });
  return prisma.campaignRecipient.findMany({ where: { campaignId } });
}

export function previewCampaign(
  template: Template,
  recipients: Array<{ resolvedParams: unknown }>,
  sampleSize = 3,
): Array<{ params: string[]; preview: string }> {
  const components = template.components as Array<{ type: string; text?: string }>;
  const body = components.find((c) => c.type === "BODY")?.text ?? "";
  return recipients.slice(0, sampleSize).map((r) => {
    const params = (r.resolvedParams as string[]) ?? [];
    return { params, preview: applyParams(body, params) };
  });
}

function applyParams(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

export async function summarizeCampaign(c: Campaign): Promise<{
  campaign: Campaign;
  counts: Record<string, number>;
}> {
  const groups = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: c.id },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of groups as unknown as Array<{ status: string; _count: { _all: number } }>) {
    counts[g.status] = g._count._all;
  }
  return { campaign: c, counts };
}
