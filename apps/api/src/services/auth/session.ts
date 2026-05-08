import crypto from "node:crypto";
import type { Session, User } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "isActive">;

export interface CreateSessionInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  return prisma.session.create({
    data: {
      token: generateToken(),
      userId: input.userId,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

export async function findValidSession(
  token: string,
): Promise<{ session: Session; user: SessionUser } | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive) return null;
  const { id, email, name, role, isActive } = session.user;
  return { session, user: { id, email, name, role, isActive } };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}
