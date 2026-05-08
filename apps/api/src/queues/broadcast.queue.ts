import { Queue } from "bullmq";
import { getRedis } from "./redis.js";

export const BROADCAST_QUEUE_NAME = "whatsapp-broadcast";

export interface BroadcastJobData {
  campaignId: string;
  recipientId: string;
}

let queue: Queue<BroadcastJobData> | null = null;

export function getBroadcastQueue(): Queue<BroadcastJobData> {
  if (queue) return queue;
  queue = new Queue<BroadcastJobData>(BROADCAST_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 5000, age: 60 * 60 * 24 * 3 },
      removeOnFail: { count: 5000, age: 60 * 60 * 24 * 7 },
    },
  });
  return queue;
}

export async function enqueueBroadcastRecipient(
  data: BroadcastJobData,
): Promise<void> {
  await getBroadcastQueue().add("send", data, {
    jobId: `recipient-${data.recipientId}`,
  });
}

export async function closeBroadcastQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
