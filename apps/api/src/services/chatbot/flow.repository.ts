import type { Flow } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { FlowDefinition } from "./flow.types.js";

export interface LoadedFlow {
  record: Flow;
  definition: FlowDefinition;
}

function parseDefinition(flow: Flow): LoadedFlow {
  return { record: flow, definition: flow.definition as unknown as FlowDefinition };
}

export async function loadFlow(id: string): Promise<LoadedFlow | null> {
  const flow = await prisma.flow.findUnique({ where: { id } });
  return flow ? parseDefinition(flow) : null;
}

export async function loadActiveFlows(): Promise<LoadedFlow[]> {
  const flows = await prisma.flow.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return flows.map(parseDefinition);
}

export function pickFlowForKeyword(
  flows: LoadedFlow[],
  text: string | null | undefined,
): LoadedFlow | null {
  const normalized = (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const keywordHit = flows.find(
    (f) =>
      f.record.triggerType === "keyword" &&
      f.record.triggerValue &&
      normalized.includes(f.record.triggerValue.toLowerCase()),
  );
  if (keywordHit) return keywordHit;

  const fallback = flows.find((f) => f.record.triggerType === "default");
  return fallback ?? null;
}
