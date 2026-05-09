import { Queue } from "bullmq";
import { getRedis } from "./redis.js";

export const REMINDER_QUEUE_NAME = "debt-reminders";

export interface ReminderTickData {
  scope: "scheduled" | "manual";
}

export interface ReminderRecipientData {
  installmentId: string;
}

let queue: Queue | null = null;

export function getReminderQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(REMINDER_QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000, age: 60 * 60 * 24 * 3 },
      removeOnFail: { count: 1000, age: 60 * 60 * 24 * 7 },
    },
  });
  return queue;
}

const DAILY_TICK_JOB_ID = "daily-debt-tick";
const REMINDER_HOUR = process.env.REMINDER_HOUR ?? "9";
const REMINDER_TZ = process.env.REMINDER_TZ ?? "America/Bogota";

/** Idempotently registers the repeatable daily job. */
export async function ensureDailyReminderSchedule(): Promise<void> {
  const q = getReminderQueue();
  await q.add(
    "tick",
    { scope: "scheduled" } satisfies ReminderTickData,
    {
      jobId: DAILY_TICK_JOB_ID,
      repeat: { pattern: `0 ${REMINDER_HOUR} * * *`, tz: REMINDER_TZ },
    },
  );
}

export async function enqueueManualReminderTick(): Promise<void> {
  await getReminderQueue().add(
    "tick",
    { scope: "manual" } satisfies ReminderTickData,
  );
}

export async function enqueueRecipient(installmentId: string): Promise<void> {
  await getReminderQueue().add(
    "send",
    { installmentId } satisfies ReminderRecipientData,
    { jobId: `reminder-${installmentId}` },
  );
}

export async function closeReminderQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
