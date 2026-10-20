"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restoreHousehold } from "@/actions/households/lifecycle";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { ArchivedHousehold } from "@/lib/households/queries";

function daysLeft(purgeAt: Date): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));
}

/** Deactivated groups the caller administers, with the days left to restore each. */
export function ArchivedHouseholds({ items }: { items: ArchivedHousehold[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) {
    return null;
  }

  function restore(householdId: string) {
    setError(null);
    startTransition(async () => {
      const result = await restoreHousehold({ householdId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Deactivated" />
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deleted permanently in {daysLeft(item.purgeAt)} days
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => restore(item.id)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
