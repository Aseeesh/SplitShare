"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setUserDisabled } from "@/actions/admin/users";
import { Button } from "@/components/ui/button";

export function UserToggle({ userId, disabled }: { userId: string; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setUserDisabled({ userId, disabled: !disabled });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <Button onClick={toggle} disabled={isPending}>
        {isPending ? "…" : disabled ? "Reinstate" : "Suspend"}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
