import "server-only";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/rate-limit";
import { RateLimitedError } from "@/lib/auth/errors";

import { decoyHash, verifyPassword } from "./password";

/**
 * Email + password sign-in.
 *
 * Auth.js's Credentials provider cannot create database sessions, so this
 * writes the same `sessions` row the Prisma adapter would and sets the same
 * cookie; from then on `auth()` treats the user exactly like a Google sign-in.
 * Placeholders cannot reach this far (no password, and a trigger forbids their
 * sessions), and suspended accounts are refused.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Must match the cookie Auth.js reads, which depends on `useSecureCookies`. */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export type PasswordLoginResult =
  | { ok: true; sessionToken: string; expires: Date }
  | { ok: false; reason: "INVALID" | "RATE_LIMITED" };

export async function passwordLogin(
  emailInput: string,
  password: string,
  clientKey: string | null,
): Promise<PasswordLoginResult> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password || password.length > 200) {
    return { ok: false, reason: "INVALID" };
  }

  try {
    // Per address and per client, so one address cannot be hammered from many
    // places nor one client sweep many addresses.
    consumeRateLimit("PASSWORD_LOGIN", `email:${email}`);
    // Only when the client address is known: a shared "unknown" bucket would
    // let one person's failures lock everybody out.
    if (clientKey) {
      consumeRateLimit("PASSWORD_LOGIN_CLIENT", clientKey);
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, reason: "RATE_LIMITED" };
    }
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, passwordHash: true, disabledAt: true, isPlaceholder: true },
  });

  // Always spend one verification, even when there is nothing to check.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  if (!user || !user.passwordHash || !valid || user.disabledAt || user.isPlaceholder) {
    return { ok: false, reason: "INVALID" };
  }

  const sessionToken = toBase64Url(new Uint8Array(randomBytes(32)));
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });
  return { ok: true, sessionToken, expires };
}
