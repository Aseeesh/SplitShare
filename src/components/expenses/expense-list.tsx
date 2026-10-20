import Link from "next/link";

import { ExpenseStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { StaggerItem } from "@/components/ui/motion";
import { Money } from "@/components/ui/money";
import { SplitProgress } from "./split-progress";
import type { ExpenseListItem } from "@/lib/expenses/queries";

/** Formats the date in the household's own terms rather than an ISO string. */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export function ExpenseList({
  householdId,
  expenses,
  title = "Recent expenses",
}: {
  householdId: string;
  expenses: ExpenseListItem[];
  title?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <Link
          href={`/households/${householdId}/expenses/new`}
          className="text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Add
        </Link>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          body="Add the first one and it will be split between whoever you choose."
        />
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {expenses.map((expense, index) => (
            <li key={expense.id}>
              <StaggerItem index={index}>
                <Link
                  href={`/households/${householdId}/expenses/${expense.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/50 dark:active:bg-slate-800"
                >
                  <div
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-full"
                    style={{ background: expense.categoryColorHex ?? "#94a3b8" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{expense.description}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(expense.date)} · {expense.paidByName} paid
                      {expense.hasReceipt ? " · receipt" : ""}
                    </p>
                    <SplitProgress
                      total={expense.participantCount}
                      accepted={expense.acceptedCount}
                      settled={expense.settledCount}
                    />
                  </div>
                  <div className="shrink-0 text-right">
                    <Money
                      cents={expense.amountCents}
                      currency={expense.currency}
                      className="text-sm"
                    />
                    <div className="mt-1 flex justify-end">
                      <ExpenseStatusBadge status={expense.status} />
                    </div>
                  </div>
                </Link>
              </StaggerItem>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
