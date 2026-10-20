"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveHousehold, leaveHousehold } from "@/actions/households/lifecycle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Leaving and deactivating. Both ask twice: they are one tap from the members
 * list, and deactivating hides the group from everyone in it.
 */
export function HouseholdDangerZone({
  householdId,
  canArchive,
  canLeave,
}: {
  householdId: string;
  canArchive: boolean;
  canLeave: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"leave" | "archive" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canArchive && !canLeave) {
    return null;
  }

  function run(kind: "leave" | "archive") {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "leave"
          ? await leaveHousehold({ householdId })
          : await archiveHousehold({ householdId });
      if (!result.ok) {
        setError(result.message);
        setConfirming(null);
        return;
      }
      router.push("/households");
      router.refresh();
    });
  }

  const copy = {
    leave: "You will lose access. Your past expenses and balances stay on the record.",
    archive:
      "Everyone loses access immediately. You can restore it for 30 days, then it is permanently deleted.",
  } as const;

  return (
    <Card className="space-y-3 border-red-200 p-4 dark:border-red-900/50">
      <h2 className="text-sm font-semibold tracking-tight">Danger zone</h2>

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">{copy[confirming]}</p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={isPending} onClick={() => run(confirming)}>
              {isPending
                ? "…"
                : confirming === "leave"
                  ? "Yes, leave"
                  : "Yes, deactivate"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canLeave ? (
            <Button variant="danger" onClick={() => setConfirming("leave")}>
              Leave household
            </Button>
          ) : null}
          {canArchive ? (
            <Button variant="danger" onClick={() => setConfirming("archive")}>
              Deactivate household
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
