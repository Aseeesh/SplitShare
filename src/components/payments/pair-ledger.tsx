"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Scale } from "lucide-react";

import { confirmOffset, proposeOffset, withdrawOffset } from "@/actions/payments/offset";
import { AnimatedMoney } from "@/components/ui/animated-money";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { PairLedger as PairLedgerData } from "@/lib/ledger/queries";

/**
 * Who owes whom, person by person, across every expense.
 *
 * When two members each still owe the other something — A owes B from dinner,
 * B owes A from the groceries — the overlap can be cancelled in one tap, leaving
 * only the true remainder. The other person confirms, since it changes the
 * record between you.
 */
export function PairLedger({
  householdId,
  currency,
  ledger,
}: {
  householdId: string;
  currency: string;
  ledger: PairLedgerData;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (ledger.positions.length === 0 && ledger.proposalsForYou.length === 0) {
    return null;
  }

  function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setBusy(key);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Between you and others" />

      <AnimatePresence initial={false}>
        {ledger.proposalsForYou.map((proposal) => (
          <motion.div
            key={proposal.reference}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-slate-200 bg-amber-50 dark:border-slate-800 dark:bg-amber-950/40"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <Scale className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm">
                {proposal.fromName} wants to cancel{" "}
                <strong className="font-mono">
                  {formatMoney(proposal.amountCents, currency)}
                </strong>{" "}
                you owe each other.
              </p>
              <Button
                disabled={busy === proposal.reference}
                onClick={() =>
                  run(proposal.reference, () =>
                    confirmOffset({ householdId, reference: proposal.reference }),
                  )
                }
              >
                {busy === proposal.reference ? "…" : "Accept"}
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {ledger.positions.map((position, index) => (
          <motion.li
            key={position.otherUserId}
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className="space-y-2 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="bg-brand/15 text-brand-strong flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                {position.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{position.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {position.netCents > 0
                    ? "owes you overall"
                    : position.netCents < 0
                      ? "you owe overall"
                      : "evenly matched"}
                </p>
              </div>
              <AnimatedMoney
                cents={position.netCents}
                currency={currency}
                signed
                className={`text-sm font-medium ${
                  position.netCents > 0
                    ? "text-emerald-600"
                    : position.netCents < 0
                      ? "text-rose-600"
                      : "text-slate-500"
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                You owe{" "}
                <span className="font-mono">
                  {formatMoney(position.youOweCents, currency)}
                </span>{" "}
                · they owe{" "}
                <span className="font-mono">
                  {formatMoney(position.theyOweCents, currency)}
                </span>
              </span>

              {position.pendingOffsetReference ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {position.pendingOffsetIsYours
                    ? "Waiting for them to accept"
                    : "Waiting for you"}
                </span>
              ) : position.cancellableCents > 0 ? (
                <Button
                  variant="secondary"
                  className="min-h-9 px-3 text-xs"
                  disabled={busy === position.otherUserId}
                  onClick={() =>
                    run(position.otherUserId, () =>
                      proposeOffset({ householdId, withUserId: position.otherUserId }),
                    )
                  }
                >
                  {busy === position.otherUserId
                    ? "…"
                    : `Cancel out ${formatMoney(position.cancellableCents, currency)}`}
                </Button>
              ) : null}
            </div>
          </motion.li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
