import type { Conversation, Prisma } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../../db/prisma.js";
import { recordOutboundMessage } from "../conversation.service.js";
import { whatsappService, WhatsAppApiError } from "../whatsapp.service.js";
import { isWithinHours, getBusinessHours } from "./business-hours.js";
import { loadActiveFlows, loadFlow, pickFlowForKeyword, type LoadedFlow } from "./flow.repository.js";
import {
  type ButtonsNode,
  type ConditionBranch,
  type FlowAction,
  type FlowDefinition,
  type FlowNode,
  type ListNode,
  type QuestionNode,
} from "./flow.types.js";
import { shouldHandoff } from "./handoff-keywords.js";
import { interpolate } from "./interpolate.js";

const MAX_NODE_HOPS = 25;

export interface EngineInput {
  conversation: Conversation;
  contact: { phoneNumber: string; profileName: string | null; name: string | null };
  text: string;
  selectionId?: string;
  isFirstInbound: boolean;
}

export async function runEngine(input: EngineInput, log: FastifyBaseLogger): Promise<void> {
  if (input.conversation.status === "assigned" || input.conversation.status === "pending") {
    log.info({ conversationId: input.conversation.id }, "conversation under human control, bot skipped");
    return;
  }

  if (shouldHandoff(input.text)) {
    await handoffConversation(input, "Te conecto con un asesor. En breve te atiende alguien del equipo.", log);
    return;
  }

  const hours = await getBusinessHours();
  if (!isWithinHours(hours)) {
    await sendBotText(input, hours.awayMessage, log);
    if (input.isFirstInbound) {
      await prisma.conversation.update({
        where: { id: input.conversation.id },
        data: { status: "pending", currentFlowId: null, currentFlowNodeId: null },
      });
    }
    return;
  }

  let conversation = input.conversation;
  let definition: FlowDefinition | null = null;
  let flow: LoadedFlow | null = null;

  if (conversation.currentFlowId && conversation.currentFlowNodeId) {
    flow = await loadFlow(conversation.currentFlowId);
    definition = flow?.definition ?? null;
  }

  if (!flow || !definition) {
    const flows = await loadActiveFlows();
    flow = pickFlowForKeyword(flows, input.text);
    if (!flow) {
      log.warn({ conversationId: conversation.id }, "no flow matched and no default configured");
      return;
    }
    definition = flow.definition;
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        currentFlowId: flow.record.id,
        currentFlowNodeId: definition.start,
        status: "bot_handling",
      },
    });
  } else {
    conversation = await consumeUserInput(conversation, definition, input);
  }

  await runFromCurrentNode(conversation, flow, definition, input, log);
}

async function consumeUserInput(
  conversation: Conversation,
  definition: FlowDefinition,
  input: EngineInput,
): Promise<Conversation> {
  const node = conversation.currentFlowNodeId
    ? definition.nodes[conversation.currentFlowNodeId]
    : undefined;
  if (!node) return conversation;

  const ctx = (conversation.context as Record<string, unknown>) ?? {};
  let nextNodeId: string | undefined;

  if (node.type === "question") {
    if ((node as QuestionNode).saveAs) {
      ctx[(node as QuestionNode).saveAs] = input.text;
    }
    nextNodeId = (node as QuestionNode).next;
  } else if (node.type === "buttons") {
    const btn = node as ButtonsNode;
    const match =
      (input.selectionId && btn.buttons.find((b) => b.id === input.selectionId)) ||
      btn.buttons.find((b) => b.title.toLowerCase() === input.text.toLowerCase());
    if (btn.saveAs && match) ctx[btn.saveAs] = match.id;
    nextNodeId = match?.goto;
  } else if (node.type === "list") {
    const list = node as ListNode;
    const allRows = list.sections.flatMap((s) => s.rows);
    const match =
      (input.selectionId && allRows.find((r) => r.id === input.selectionId)) ||
      allRows.find((r) => r.title.toLowerCase() === input.text.toLowerCase());
    if (list.saveAs && match) ctx[list.saveAs] = match.id;
    nextNodeId = match?.goto;
  }

  if (!nextNodeId) return conversation;

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      currentFlowNodeId: nextNodeId,
      context: ctx as Prisma.InputJsonValue,
    },
  });
}

async function runFromCurrentNode(
  initialConversation: Conversation,
  flow: LoadedFlow,
  definition: FlowDefinition,
  input: EngineInput,
  log: FastifyBaseLogger,
): Promise<void> {
  let conversation = initialConversation;
  let hops = 0;

  while (hops < MAX_NODE_HOPS) {
    const nodeId = conversation.currentFlowNodeId;
    if (!nodeId) break;

    const node = definition.nodes[nodeId];
    if (!node) {
      log.warn({ flowId: flow.record.id, nodeId }, "node missing in flow definition");
      break;
    }

    const ctx = buildRenderContext(conversation, input);

    if (node.type === "message") {
      await sendBotText(input, interpolate(node.text, ctx), log);
      if (!node.next) {
        await clearFlow(conversation.id);
        return;
      }
      conversation = await advance(conversation, node.next);
    } else if (node.type === "question") {
      await sendBotText(input, interpolate(node.text, ctx), log);
      return;
    } else if (node.type === "buttons") {
      await sendBotButtons(input, node, ctx, log);
      return;
    } else if (node.type === "list") {
      await sendBotList(input, node, ctx, log);
      return;
    } else if (node.type === "condition") {
      const branch = pickBranch(node.branches, conversation.context as Record<string, unknown>);
      const goto = branch?.goto ?? node.fallback;
      if (!goto) {
        await clearFlow(conversation.id);
        return;
      }
      conversation = await advance(conversation, goto);
    } else if (node.type === "action") {
      conversation = await applyActions(conversation, node.actions);
      if (!node.next) {
        await clearFlow(conversation.id);
        return;
      }
      conversation = await advance(conversation, node.next);
    } else if (node.type === "handoff") {
      await handoffConversation(
        input,
        interpolate(node.message ?? "Te conecto con un asesor.", ctx),
        log,
      );
      return;
    } else if (node.type === "end") {
      if (node.message) await sendBotText(input, interpolate(node.message, ctx), log);
      await clearFlow(conversation.id);
      return;
    } else {
      log.error({ node }, "unknown node type");
      return;
    }

    hops++;
  }

  if (hops >= MAX_NODE_HOPS) {
    log.error({ flowId: flow.record.id }, "flow exceeded MAX_NODE_HOPS — possible loop");
  }
}

function buildRenderContext(conversation: Conversation, input: EngineInput): Record<string, unknown> {
  return {
    ...(conversation.context as Record<string, unknown>),
    profile_name: input.contact.profileName ?? input.contact.name ?? "",
    phone: input.contact.phoneNumber,
  };
}

function pickBranch(
  branches: ConditionBranch[],
  ctx: Record<string, unknown>,
): ConditionBranch | undefined {
  return branches.find((b) => evaluateBranch(b, ctx));
}

function evaluateBranch(b: ConditionBranch, ctx: Record<string, unknown>): boolean {
  const value = ctx[b.variable];
  switch (b.operator) {
    case "exists":
      return value !== undefined && value !== null && value !== "";
    case "equals":
      return String(value ?? "") === String(b.value ?? "");
    case "not_equals":
      return String(value ?? "") !== String(b.value ?? "");
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(b.value ?? "").toLowerCase());
    case "matches":
      try {
        return new RegExp(b.value ?? "").test(String(value ?? ""));
      } catch {
        return false;
      }
  }
}

async function applyActions(conversation: Conversation, actions: FlowAction[]): Promise<Conversation> {
  const ctx = { ...((conversation.context as Record<string, unknown>) ?? {}) };
  for (const action of actions) {
    if (action.kind === "set") {
      ctx[action.variable] = action.value;
    } else if (action.kind === "tag_contact") {
      const contact = await prisma.contact.findFirst({
        where: { conversations: { some: { id: conversation.id } } },
      });
      if (contact && !contact.tags.includes(action.tag)) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { tags: { set: [...contact.tags, action.tag] } },
        });
      }
    }
  }
  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { context: ctx as Prisma.InputJsonValue },
  });
}

async function advance(conversation: Conversation, nodeId: string): Promise<Conversation> {
  return prisma.conversation.update({
    where: { id: conversation.id },
    data: { currentFlowNodeId: nodeId },
  });
}

async function clearFlow(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { currentFlowId: null, currentFlowNodeId: null },
  });
}

async function handoffConversation(
  input: EngineInput,
  message: string,
  log: FastifyBaseLogger,
): Promise<void> {
  await sendBotText(input, message, log);
  await prisma.conversation.update({
    where: { id: input.conversation.id },
    data: { status: "pending", currentFlowId: null, currentFlowNodeId: null },
  });
  log.info({ conversationId: input.conversation.id }, "conversation handed off to humans");
}

async function sendBotText(input: EngineInput, body: string, log: FastifyBaseLogger): Promise<void> {
  try {
    const result = await whatsappService.sendText({ to: input.contact.phoneNumber, body });
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      whatsappMessageId: result.whatsappMessageId,
      type: "text",
      content: { body },
      status: "sent",
      sentBy: "bot",
    });
  } catch (err) {
    logSendError(err, log);
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      type: "text",
      content: { body },
      status: "failed",
      sentBy: "bot",
    });
  }
}

async function sendBotButtons(
  input: EngineInput,
  node: ButtonsNode,
  ctx: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<void> {
  const body = interpolate(node.text, ctx);
  const buttons = node.buttons.map((b) => ({ id: b.id, title: b.title }));
  try {
    const result = await whatsappService.sendButtons({
      to: input.contact.phoneNumber,
      body,
      footer: node.footer,
      buttons,
    });
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      whatsappMessageId: result.whatsappMessageId,
      type: "interactive",
      content: { kind: "buttons", body, buttons },
      status: "sent",
      sentBy: "bot",
    });
  } catch (err) {
    logSendError(err, log);
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      type: "interactive",
      content: { kind: "buttons", body, buttons },
      status: "failed",
      sentBy: "bot",
    });
  }
}

async function sendBotList(
  input: EngineInput,
  node: ListNode,
  ctx: Record<string, unknown>,
  log: FastifyBaseLogger,
): Promise<void> {
  const body = interpolate(node.text, ctx);
  const sections = node.sections.map((s) => ({
    title: s.title,
    rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
  }));
  try {
    const result = await whatsappService.sendList({
      to: input.contact.phoneNumber,
      body,
      footer: node.footer,
      buttonText: node.buttonText,
      sections,
    });
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      whatsappMessageId: result.whatsappMessageId,
      type: "interactive",
      content: { kind: "list", body, sections },
      status: "sent",
      sentBy: "bot",
    });
  } catch (err) {
    logSendError(err, log);
    await recordOutboundMessage({
      conversationId: input.conversation.id,
      type: "interactive",
      content: { kind: "list", body, sections },
      status: "failed",
      sentBy: "bot",
    });
  }
}

function logSendError(err: unknown, log: FastifyBaseLogger): void {
  if (err instanceof WhatsAppApiError) {
    log.error({ status: err.status, body: err.body }, "WhatsApp API error");
  } else {
    log.error({ err }, "unexpected send error");
  }
}

export type FlowNodeForTests = FlowNode;
