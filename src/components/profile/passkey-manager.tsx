"use client";

import { signIn } from "next-auth/webauthn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removePasskey } from "@/actions/profile/passkeys";

export interface PasskeyRow {
  id: string;
  createdAt: string;
  deviceType: string;
  backedUp: boolean;
}

/** Lists the signed-in user's passkeys and registers or removes them. */
export function PasskeyManager({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("passkey", { action: "register", redirect: false });
      if (result?.error) {
        setError("Could not save the passkey. Try again.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Passkey setup was cancelled or is not available on this device.");
    }
    setBusy(false);
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePasskey({ id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Sign in with Face ID, a fingerprint or your device PIN instead of going through
        Google each time. Add one on every device you use, including the home-screen app.
      </p>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {passkeys.map((key) => (
          <li key={key.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {key.deviceType === "multiDevice" ? "Synced passkey" : "This device only"}
              <span className="ml-2 text-xs text-slate-500">
                added {new Date(key.createdAt).toLocaleDateString()}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(key.id)}
              className="text-xs text-red-700 underline disabled:opacity-60 dark:text-red-300"
            >
              Remove
            </button>
          </li>
        ))}
        {passkeys.length === 0 ? (
          <li className="py-2 text-sm text-slate-500">No passkeys yet.</li>
        ) : null}
      </ul>
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-900"
      >
        {busy ? "Waiting for device…" : "Add a passkey"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
