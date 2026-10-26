"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createHousehold } from "@/actions/households/create";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const CURRENCIES = ["NZD", "USD", "AUD", "EUR", "GBP"];

/**
 * Creates a household and jumps straight into it. The first member — the
 * creator — is its ADMIN, which is what lets them invite the rest.
 */
export function CreateHousehold() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NZD");
  // Quick mode by default: nobody has to accept a share before it counts.
  const [requireAcceptance, setRequireAcceptance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createHousehold({ name, currency, requireAcceptance });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/households/${result.data.householdId}`);
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold tracking-tight">Create a household</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Household name"
          maxLength={100}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          aria-label="Currency"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <Button onClick={submit} disabled={isPending || name.trim() === ""}>
          {isPending ? "…" : "Create"}
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={requireAcceptance}
          onChange={(event) => setRequireAcceptance(event.target.checked)}
          className="accent-brand mt-0.5 size-4"
        />
        <span>
          Everyone must accept their share before it counts. Leave off for a simple,
          Splitwise-style group. You can change this later.
        </span>
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
