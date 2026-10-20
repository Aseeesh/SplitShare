"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateProfile } from "@/actions/profile/update";
import { Button } from "@/components/ui/button";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfile({ name });
      setMessage(result.ok ? "Saved" : result.message);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Display name"
        maxLength={60}
        className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
      <Button onClick={submit} disabled={isPending || name.trim() === ""}>
        {isPending ? "…" : "Save"}
      </Button>
      {message ? (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
