import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/auth/audit.js";
import { verifyPassword } from "../services/auth/password.js";
import { createSession, revokeSession } from "../services/auth/session.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !user.isActive) {
      reply.code(401).send({ error: "invalid_credentials" });
      return;
    }
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      await audit({
        action: "auth.login_failed",
        entityType: "user",
        entityId: user.id,
        metadata: { reason: "wrong_password" },
      });
      reply.code(401).send({ error: "invalid_credentials" });
      return;
    }

    const session = await createSession({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    reply.setCookie(env.SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      expires: session.expiresAt,
      signed: false,
    });

    await audit({
      userId: user.id,
      action: "auth.login_success",
      entityType: "user",
      entityId: user.id,
    });

    reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[env.SESSION_COOKIE_NAME];
    if (token) {
      await revokeSession(token);
    }
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    reply.send({ ok: true });
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => {
    return { user: req.user };
  });
}
