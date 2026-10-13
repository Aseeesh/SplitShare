"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createRecurringExpense,
  toggleRecurringExpense,
} from "@/actions/expenses/recurring";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import type { RecurrenceFrequency } from "@/generated/prisma/enums";
import type { RecurringExpenseItem } from "@/lib/recurring/queries";
import { formatMoney, parseMoneyInput } from "@/lib/money";

const FREQUENCIES: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

function frequencyLabel(frequency: RecurrenceFrequency): string {
  return FREQUENCIES.find((entry) => entry.value === frequency)?.label ?? frequency;
}

/** Creates and lists recurring expenses, always split EQUAL among all members. */
export function RecurringSection({
  householdId,
  currency,
  members,
  items,
  canCreate,
}: {
  householdId: string;
  currency: string;
  members: Array<{ userId: string; name: string }>;
  items: RecurringExpenseItem[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("MONTHLY");
  const [paidByUserId, setPaidByUserId] = useState(members[0]?.userId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountCents = parseMoneyInput(amountText, currency);

  function submit() {
    if (description.trim() === "" || amountCents === null) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createRecurringExpense({
        householdId,
        description,
        amountCents,
        categoryId: null,
        paidByUserId,
        frequency,
        startAt: new Date().toISOString().slice(0, 10),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDescription("");
      setAmountText("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Recurring" />

      {canCreate ? (
        <div className="space-y-2 p-4">
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Rent, Wi-Fi, subscription…"
            maxLength={200}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="flex flex-wrap gap-2">
            <input
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="min-h-11 w-28 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as RecurrenceFrequency)
              }
              className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {FREQUENCIES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <select
              value={paidByUserId}
              onChange={(event) => setPaidByUserId(event.target.value)}
              className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name} pays
                </option>
              ))}
            </select>
            <Button
              onClick={submit}
              disabled={isPending || description.trim() === "" || amountCents === null}
            >
              {isPending ? "…" : "Add recurring"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.description}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatMoney(item.amountCents, item.currency)} ·{" "}
                  {frequencyLabel(item.frequency)} · {item.paidByName} pays · next{" "}
                  {format(item.nextRunAt, "d MMM yyyy")}
                </p>
              </div>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await toggleRecurringExpense({
                        householdId,
                        id: item.id,
                        active: !item.active,
                      });
                      router.refresh();
                    })
                  }
                  className={`shrink-0 text-sm font-medium ${
                    item.active ? "text-slate-500" : "text-brand-strong"
                  }`}
                >
                  {item.active ? "Pause" : "Resume"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No recurring expenses"
          body="Set up rent, Wi-Fi and subscriptions here and they will repeat automatically."
        />
      )}
    </Card>
  );
}
