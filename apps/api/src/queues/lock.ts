import crypto from "node:crypto";
import { getRedis } from "./redis.js";

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

interface LockOptions {
  ttlMs?: number;
  retryDelayMs?: number;
  maxWaitMs?: number;
}

/**
 * Acquires a Redis-backed mutex for `key`, runs `fn`, releases the lock.
 * Other callers for the same `key` block (with retry) until the holder finishes.
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const redis = getRedis();
  const lockKey = `lock:${key}`;
  const token = crypto.randomBytes(16).toString("hex");
  const ttl = opts.ttlMs ?? 30_000;
  const retryDelay = opts.retryDelayMs ?? 50;
  const maxWait = opts.maxWaitMs ?? 30_000;
  const start = Date.now();

  while (true) {
    const acquired = await redis.set(lockKey, token, "PX", ttl, "NX");
    if (acquired === "OK") break;
    if (Date.now() - start > maxWait) {
      throw new Error(`could not acquire lock for ${key} within ${maxWait}ms`);
    }
    await new Promise((r) => setTimeout(r, retryDelay));
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_LUA, 1, lockKey, token);
    } catch {
      // best-effort release; TTL ensures eventual cleanup
    }
  }
}
