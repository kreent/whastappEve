import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "./types";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "wa_session";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

export async function getUserFromCookie(): Promise<User | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: User };
    return data.user;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUserFromCookie();
  if (!user) redirect("/login");
  return user;
}
