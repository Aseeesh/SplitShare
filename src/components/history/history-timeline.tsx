import { format } from "date-fns";
import Link from "next/link";
import { ArrowRight, Paperclip, ReceiptText } from "lucide-react";

import { Card, EmptyState } from "@/components/ui/card";
import { StaggerItem } from "@/components/ui/motion";
import type { HistoryEntry } from "@/lib/history/queries";
import { formatMoney } from "@/lib/money";
import {
  EXPENSE_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  STATUS_BADGE_BASE,
} from "@/lib/ui/status";
import type { ExpenseStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * The household activity feed, newest first. Expenses link through to their
 * detail page; payments are inline (they have no page of their own).
 */
export function HistoryTimeline({
  householdId,
  entries,
}: {
  householdId: string;
  entries: HistoryEntry[];
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No activity yet"
          body="Expenses and payments will appear here as they happen."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const isExpense = entry.kind === "expense";
        const tone = isExpense
          ? EXPENSE_STATUS_TONES[entry.status as ExpenseStatus]
          : PAYMENT_STATUS_TONES[entry.status as PaymentStatus];
        const Icon = isExpense ? ReceiptText : ArrowRight;

        const row = (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50">
            <span
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${tone.className}`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{entry.title}</p>
                <span className="shrink-0 font-mono text-sm font-medium">
                  {formatMoney(entry.amountCents, entry.currency)}
                </span>
              </div>
              {entry.subtitle && (
                <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                  {entry.subtitle}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${STATUS_BADGE_BASE} ${tone.className}`}>
                  {tone.label}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {format(entry.date, "d MMM yyyy")}
                </span>
                {entry.hasReceipt && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                    <Paperclip className="size-3" aria-hidden="true" />
                    Receipt
                  </span>
                )}
              </div>
            </div>
          </div>
        );

        return (
          <StaggerItem key={`${entry.kind}-${entry.id}`} index={i}>
            {isExpense ? (
              <Link
                href={`/households/${householdId}/expenses/${entry.id}`}
                className="block"
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </StaggerItem>
        );
      })}
    </div>
  );
}
