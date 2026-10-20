import "server-only";

import { prisma } from "@/lib/db/client";
import { fromDbCents } from "@/lib/money";

import { outstandingDebts, type DebtMatrix } from "./pairwise";

/**
 * Loads what the pairwise ledger needs and computes it. No authorisation here:
 * callers have already run the §2.4 guard chain for this household.
 *
 * The expense set is exactly §12's countable set, so these debts always agree
 * with the balances; confirmed payments of every method (offsets included) are
 * subtracted.
 */
export async function loadDebtMatrix(householdId: string): Promise<DebtMatrix> {
  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({
      where: {
        householdId,
        reversesExpenseId: null,
        status: { in: ["ACCEPTED", "PARTIALLY_PAID", "PAID", "LOCKED"] },
      },
      select: {
        funders: { select: { userId: true, amountCents: true } },
        splits: {
          where: { acceptance: "ACCEPTED" },
          select: { userId: true, amountCents: true },
        },
      },
    }),
    prisma.payment.findMany({
      where: { householdId, confirmation: { isNot: null } },
      select: { fromUserId: true, toUserId: true, amountCents: true },
    }),
  ]);

  return outstandingDebts(
    expenses.map((expense) => ({
      funders: expense.funders.map((f) => ({
        userId: f.userId,
        cents: fromDbCents(f.amountCents, "funder amount"),
      })),
      splits: expense.splits.map((s) => ({
        userId: s.userId,
        cents: fromDbCents(s.amountCents, "split amount"),
      })),
    })),
    payments.map((p) => ({
      fromUserId: p.fromUserId,
      toUserId: p.toUserId,
      cents: fromDbCents(p.amountCents, "payment amount"),
    })),
  );
}
