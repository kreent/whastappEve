import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { findValidSession, type SessionUser } from "../services/auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies[env.SESSION_COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
  const valid = await findValidSession(token);
  if (!valid) {
    reply.code(401).send({ error: "session_expired" });
    return;
  }
  req.user = valid.user;
}

export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (req.user?.role !== "admin") {
    reply.code(403).send({ error: "forbidden" });
  }
}
