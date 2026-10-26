"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateRequireAcceptance } from "@/actions/households/settings";

/**
 * ADMIN-only switch for quick mode. Off means new expenses count straight away
 * with no accept step; on means each person must accept their own share first.
 */
export function AcceptanceSetting({
  householdId,
  requireAcceptance,
}: {
  householdId: string;
  requireAcceptance: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">
          <span className="block text-slate-700 dark:text-slate-300">
            Everyone must accept their share
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Off: new expenses count immediately (quick mode). Applies to expenses added
            from now on.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={requireAcceptance}
          disabled={isPending}
          onChange={(event) => {
            setError(null);
            startTransition(async () => {
              const result = await updateRequireAcceptance({
                householdId,
                requireAcceptance: event.target.checked,
              });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.refresh();
            });
          }}
          className="accent-brand size-6 shrink-0"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
