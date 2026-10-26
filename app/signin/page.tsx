import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleIcon } from "@/components/auth/google-icon";
import { getOptionalUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Sign in · SplitHome",
  description: "Sign in to your household.",
};

/**
 * The page `authConfig.pages.signIn` points at.
 *
 * Auth.js reports failures by redirecting back here with `?error=`, so the
 * codes it can send are mapped to something a person can act on rather than
 * shown raw.
 */
const ERROR_MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in is not configured correctly. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET.",
  AccessDenied: "You declined the Google sign-in request.",
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method.",
  Verification: "That sign-in link has expired. Request a new one.",
};

function errorMessage(error: string | string[] | undefined): string | null {
  if (error === undefined) {
    return null;
  }
  const code = Array.isArray(error) ? error[0] : error;
  return ERROR_MESSAGES[code] ?? "Something went wrong signing you in. Please try again.";
}

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  // Already signed in: nothing to do here.
  if (await getOptionalUser()) {
    redirect("/");
  }

  const { error, callbackUrl } = await searchParams;
  const message = errorMessage(error);
  const redirectTo = typeof callbackUrl === "string" ? callbackUrl : "/";

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-semibold tracking-tight">SplitHome</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Share household expenses without the spreadsheet.
          </p>

          {message ? (
            <p
              role="alert"
              className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-950 dark:text-red-300 dark:ring-red-400/20"
            >
              {message}
            </p>
          ) : null}

          <form className="mt-6" method="POST" action="/api/oauth/google">
            <input type="hidden" name="callbackUrl" value={redirectTo} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          You will only be able to see households you have been invited to.
        </p>
      </div>
    </main>
  );
}
