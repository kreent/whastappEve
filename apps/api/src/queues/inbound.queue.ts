import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "./redis.js";
import type { WhatsAppWebhookPayload } from "../services/whatsapp.types.js";

export const INBOUND_QUEUE_NAME = "whatsapp-inbound";

export interface InboundJobData {
  payload: WhatsAppWebhookPayload;
  receivedAt: string;
}

let queue: Queue<InboundJobData> | null = null;

export function getInboundQueue(): Queue<InboundJobData> {
  if (queue) return queue;
  queue = new Queue<InboundJobData>(INBOUND_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000, age: 60 * 60 * 24 },
      removeOnFail: { count: 5000, age: 60 * 60 * 24 * 7 },
    },
  });
  return queue;
}

export async function enqueueInbound(
  data: InboundJobData,
  jobId?: string,
  opts?: JobsOptions,
): Promise<void> {
  await getInboundQueue().add("process", data, { jobId, ...opts });
}

export async function closeInboundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
