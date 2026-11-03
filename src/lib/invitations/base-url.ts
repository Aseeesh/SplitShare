import "server-only";

import { headers } from "next/headers";

/**
 * The origin to put in links we email or hand out.
 *
 * Taken from the request that is creating the invitation, so the link always
 * points at the deployment the admin is actually using. `NEXT_PUBLIC_APP_URL`
 * is only a fallback: a stale value there (an old domain, localhost) used to
 * produce invite links that 404.
 */
export async function appBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
      const proto =
        h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // No request context (cron, tests): fall through to configuration.
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
