/**
 * Invitation tokens.
 *
 * The database stores only a SHA-256 of the token, never the token itself. The
 * raw value exists in exactly one place — the invitation email — so a leak of
 * the `invitations` table does not let anyone join a household. Lookup is by
 * hash, which is also why no constant-time comparison is needed here: we never
 * compare secrets, we index on the digest.
 *
 * Pure apart from Web Crypto, so expiry and status logic are unit-testable.
 */

/** 256 bits of entropy, url-safe so it survives being pasted into a link. */
const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  // btoa is global in Node >= 16 and in workerd; Buffer is neither, so the
  // base64url encoding is spelled out instead of Buffer.from(...).toString().
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const DEFAULT_INVITATION_TTL_DAYS = 7;

export function generateInvitationToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function invitationExpiresAt(
  now: Date,
  ttlDays: number = DEFAULT_INVITATION_TTL_DAYS,
): Date {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);
  return expiresAt;
}

export interface InvitationLike {
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
}

/**
 * Whether an invitation can still be accepted.
 *
 * Expiry is derived from the clock rather than trusted from the stored status,
 * because nothing sweeps PENDING rows into EXPIRED — a row can sit PENDING long
 * past its date, and treating that as usable would make invitations immortal.
 */
export function isAcceptable(invitation: InvitationLike, now: Date): boolean {
  return (
    invitation.status === "PENDING" && invitation.expiresAt.getTime() > now.getTime()
  );
}

export type InvitationRejection = "ALREADY_ACCEPTED" | "REVOKED" | "EXPIRED";

/** Why an invitation cannot be accepted, or null if it can. */
export function rejectionReason(
  invitation: InvitationLike,
  now: Date,
): InvitationRejection | null {
  if (invitation.status === "ACCEPTED") {
    return "ALREADY_ACCEPTED";
  }
  if (invitation.status === "REVOKED") {
    return "REVOKED";
  }
  if (
    invitation.status === "EXPIRED" ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return null;
}

export const REJECTION_MESSAGES: Record<InvitationRejection, string> = {
  ALREADY_ACCEPTED: "That invitation has already been used.",
  REVOKED: "That invitation was withdrawn.",
  EXPIRED: "That invitation has expired. Ask an admin to send a new one.",
};

/** The link that goes in the email. */
export function buildInvitationUrl(appUrl: string, token: string): string {
  return new URL(`/invite/${encodeURIComponent(token)}`, appUrl).toString();
}
