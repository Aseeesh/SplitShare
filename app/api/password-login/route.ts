import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import {
  passwordLogin,
  sessionCookieName,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/password-login";

/**
 * Form target for the email + password sign-in. Redirects (303) back to the
 * sign-in page with a generic error code on any failure, so the response never
 * says whether the email exists.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const redirectTo = safeRedirectPath(form.get("callbackUrl"));

  const origin = new URL(req.url).origin;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const result = await passwordLogin(email, password, forwarded ?? "unknown");

  if (!result.ok) {
    const code =
      result.reason === "RATE_LIMITED" ? "PasswordRateLimited" : "PasswordInvalid";
    const url = new URL("/signin", origin);
    url.searchParams.set("error", code);
    if (redirectTo !== "/") {
      url.searchParams.set("callbackUrl", redirectTo);
    }
    return NextResponse.redirect(url, 303);
  }

  const response = NextResponse.redirect(new URL(redirectTo, origin), 303);
  response.cookies.set(sessionCookieName(), result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(origin).protocol === "https:",
    path: "/",
    expires: result.expires,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
