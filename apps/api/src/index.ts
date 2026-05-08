import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { closeBroadcastQueue } from "./queues/broadcast.queue.js";
import { startBroadcastWorker } from "./queues/broadcast.worker.js";
import { closeInboundQueue } from "./queues/inbound.queue.js";
import { startInboundWorker } from "./queues/inbound.worker.js";
import { closeRedis } from "./queues/redis.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const app = await buildServer();
  const inboundWorker = startInboundWorker(app.log);
  const broadcastWorker = startBroadcastWorker(app.log);
  app.log.info({ concurrency: env.WORKER_CONCURRENCY }, "inbound worker started");
  app.log.info("broadcast worker started");

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      await inboundWorker.close();
      await broadcastWorker.close();
      await closeInboundQueue();
      await closeBroadcastQueue();
      await closeRedis();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ host: "0.0.0.0", port: env.PORT });
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
}

void main();
