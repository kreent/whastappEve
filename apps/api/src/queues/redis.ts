import IORedis, { type Redis } from "ioredis";
import { env } from "../config/env.js";

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (connection) return connection;
  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
