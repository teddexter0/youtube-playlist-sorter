import { cookies } from "next/headers";
import crypto from "crypto";

const cookieName = "ytjanitor_session";

function secret(): string {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required for sessions");
  return value;
}

export function signUserId(userId: string): string {
  const sig = crypto.createHmac("sha256", secret()).update(userId).digest("base64url");
  return `${userId}.${sig}`;
}

export function verifySignedUserId(value?: string): string | null {
  if (!value) return null;
  const index = value.lastIndexOf(".");
  if (index < 1) return null;
  const userId = value.slice(0, index);
  const expected = signUserId(userId);
  try {
    if (crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) return userId;
  } catch {
    return null;
  }
  return null;
}

export function getCurrentUserId(): string | null {
  return verifySignedUserId(cookies().get(cookieName)?.value);
}

export function setSessionCookie(userId: string) {
  cookies().set(cookieName, signUserId(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}

export function clearSessionCookie() {
  cookies().delete(cookieName);
}
