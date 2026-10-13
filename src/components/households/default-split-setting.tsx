"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateDefaultSplitMethod } from "@/actions/households/settings";
import type { SplitMethod } from "@/generated/prisma/enums";

const METHODS: SplitMethod[] = ["EQUAL", "EXACT", "PERCENTAGE", "SHARES"];

/**
 * ADMIN-only setting: the split method the expense form pre-selects for new
 * expenses in this household.
 */
export function DefaultSplitSetting({
  householdId,
  current,
  canManage,
}: {
  householdId: string;
  current: SplitMethod;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-slate-600 dark:text-slate-400">
        Default split for new expenses
      </span>
      <div className="flex items-center gap-2">
        <select
          value={current}
          disabled={!canManage || isPending}
          onChange={(event) => {
            setError(null);
            startTransition(async () => {
              const result = await updateDefaultSplitMethod({
                householdId,
                method: event.target.value as SplitMethod,
              });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.refresh();
            });
          }}
          className="min-h-9 rounded-lg border border-slate-300 px-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method.charAt(0) + method.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
