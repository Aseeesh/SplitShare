"use client";

import { useCallback, useId, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";

import { GoogleIcon } from "./google-icon";

/**
 * A button that opens sign-in as a bottom sheet instead of navigating to
 * `/signin`. Each button owns its sheet, so it works from server components
 * (the landing page, the invite page) without any shared provider.
 */
export function SignInButton({
  callbackUrl = "/",
  className,
  children,
}: {
  callbackUrl?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      <BottomSheet open={open} onClose={close} titleId={titleId}>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-brand flex size-11 items-center justify-center rounded-xl text-lg font-bold text-white"
          >
            S
          </span>
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              Welcome to SplitHome
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sign in to start sharing expenses.
            </p>
          </div>
        </div>

        <form
          className="mt-6"
          method="POST"
          action="/api/oauth/google"
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <button
            data-autofocus
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-[colors,transform] hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 active:scale-[0.99] disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <GoogleIcon />
            {submitting ? "Opening Google…" : "Continue with Google"}
          </button>
        </form>

        <ul className="mt-5 space-y-2 text-xs text-slate-600 dark:text-slate-400">
          <li>New here? Your account is created the first time you sign in.</li>
          <li>Start a group and you become its admin.</li>
          <li>
            Got an invite link? Sign in, then open it to join with the role you were
            given.
          </li>
        </ul>

        <button
          type="button"
          onClick={close}
          className="mt-4 min-h-11 w-full rounded-xl text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Not now
        </button>
      </BottomSheet>
    </>
  );
}
