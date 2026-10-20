"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Receipt, Wallet } from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { ActivityItem } from "@/lib/overview/queries";

function ago(date: Date): string {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(date).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

/** Latest activity across every organisation, each row tagged with its organisation. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        Nothing yet. Expenses and payments from all your groups will show up here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {items.map((item, index) => {
        const Icon = item.kind === "expense" ? Receipt : Wallet;
        return (
          <motion.li
            key={`${item.kind}-${item.id}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.28 }}
          >
            <Link
              href={`/households/${item.householdId}/history`}
              className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/50"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                  item.kind === "expense"
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {item.householdName} · {ago(item.at)}
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums">
                {formatMoney(item.amountCents, item.currency)}
              </span>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
