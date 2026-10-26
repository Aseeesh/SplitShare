"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createHousehold } from "@/actions/households/create";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const CURRENCIES = ["NZD", "USD", "AUD", "EUR", "GBP"];

/**
 * First-run screen: one name, one tap. Creates a quick-mode group (no accept
 * step) and lands on the members page, where the next job is adding people.
 */
export function QuickStart({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [name, setName] = useState("Home");
  const [currency, setCurrency] = useState("NZD");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await createHousehold({ name, currency, requireAcceptance: false });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/households/${result.data.householdId}/members`);
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hi {firstName}, let’s get started
      </h1>
      <ol className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
        <li>1. Name your group</li>
        <li>2. Add the people you split with</li>
        <li>3. Add an expense. That is it.</li>
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Group name"
          placeholder="Group name, e.g. Flat 3"
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
      </div>
      <Button
        onClick={start}
        disabled={isPending || name.trim() === ""}
        className="mt-3 w-full"
      >
        {isPending ? "Setting up…" : "Start splitting"}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">
        Got an invite link instead? Just open it.
      </p>
    </Card>
  );
}
