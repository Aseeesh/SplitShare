"use client";

import { signIn } from "next-auth/webauthn";
import { useState } from "react";

/** Signs in with a passkey already registered on this device or password manager. */
export function PasskeySignIn({ redirectTo }: { redirectTo: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("passkey", { redirectTo, redirect: false });
      if (result?.error) {
        setError(
          "That passkey was not recognised. Sign in with Google, then add one from your profile.",
        );
        setBusy(false);
        return;
      }
      window.location.assign(redirectTo);
    } catch {
      setError("Passkey sign-in was cancelled or is not available here.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {busy ? "Waiting for passkey…" : "Sign in with Face ID / fingerprint"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
