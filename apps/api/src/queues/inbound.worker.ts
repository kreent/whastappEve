import { Worker, type Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { handleWebhookPayload } from "../services/inbound-handler.js";
import { INBOUND_QUEUE_NAME, type InboundJobData } from "./inbound.queue.js";
import { getRedis } from "./redis.js";

export function startInboundWorker(logger: FastifyBaseLogger): Worker<InboundJobData> {
  const worker = new Worker<InboundJobData>(
    INBOUND_QUEUE_NAME,
    async (job: Job<InboundJobData>) => {
      const childLog = logger.child({ jobId: job.id, attempt: job.attemptsMade + 1 });
      childLog.info("processing inbound job");
      await handleWebhookPayload(job.data.payload, childLog);
    },
    {
      connection: getRedis(),
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "inbound job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, attempt: job?.attemptsMade, err: err.message },
      "inbound job failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err: err.message }, "inbound worker error");
  });

  return worker;
}
