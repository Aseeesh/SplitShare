"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setHouseholdSuspended } from "@/actions/admin/platform";
import { Button } from "@/components/ui/button";

export function HouseholdToggle({
  householdId,
  status,
}: {
  householdId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const suspended = status === "SUSPENDED";

  return (
    <div className="text-right">
      <Button
        variant={suspended ? "secondary" : "danger"}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setHouseholdSuspended({
              householdId,
              suspended: !suspended,
            });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.refresh();
          })
        }
      >
        {isPending ? "…" : suspended ? "Activate" : "Deactivate"}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
