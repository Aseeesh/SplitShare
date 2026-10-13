import { Auth, skipCSRFCheck } from "@auth/core";

import { authConfig } from "@/lib/auth/config";

/**
 * OAuth sign-in entry point.
 *
 * The canonical `signIn("google")` server action sets the PKCE/state cookies
 * through `cookies().set()` before throwing `redirect()`, which does not
 * survive to the callback on Next.js 16 — the cookie round-trip breaks and the
 * Google callback fails with "pkceCodeVerifier value could not be parsed".
 *
 * Routing the sign-in through a Route Handler instead lets Auth.js return the
 * 302 + `Set-Cookie` headers directly, which the browser (on a normal form
 * POST) stores before following the redirect to Google. The form below posts
 * to this handler; `skipCSRFCheck` mirrors what the server action did, so no
 * CSRF token round-trip is required for this internal initiation.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const callbackUrl = (form.get("callbackUrl") as string | null) ?? "/";

  const base = process.env.AUTH_URL ?? new URL(req.url).origin;
  const signinUrl = `${base.replace(/\/$/, "")}/api/auth/signin/google`;

  const signinReq = new Request(signinUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ callbackUrl }),
  });

  return Auth(signinReq, {
    ...authConfig,
    basePath: "/api/auth",
    secret: process.env.AUTH_SECRET,
    skipCSRFCheck,
  });
}
