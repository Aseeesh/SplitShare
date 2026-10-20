import "server-only";

import type { Prisma } from "@/generated/prisma-node/client";
import type { ExpenseStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db/client";

import { ExpenseStateError, statusAfterReversal } from "./state";

/**
 * Reversing an expense (§2.2, §7): nothing is edited or deleted. A new expense
 * carries the exact negation of the original's amount, funders and splits, and
 * the original moves to REVERSED. Shared by `reverseExpense` (delete) and
 * `correctExpense` (edit), so both behave identically.
 */

export interface ReversibleExpense {
  id: string;
  householdId: string;
  status: ExpenseStatus;
  createdByUserId: string;
  description: string;
  amountCents: bigint;
  currency: string;
  categoryId: string | null;
  paidByUserId: string;
  splitMethod: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
  alreadyReversed: boolean;
  funders: Array<{ userId: string; amountCents: bigint }>;
  splits: Array<{
    userId: string;
    amountCents: bigint;
    percentBps: number | null;
    shares: number | null;
  }>;
}

export async function loadReversible(
  expenseId: string,
): Promise<ReversibleExpense | null> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      householdId: true,
      status: true,
      createdByUserId: true,
      description: true,
      amountCents: true,
      currency: true,
      categoryId: true,
      paidByUserId: true,
      splitMethod: true,
      reversedBy: { select: { id: true } },
      funders: { select: { userId: true, amountCents: true } },
      splits: {
        select: { userId: true, amountCents: true, percentBps: true, shares: true },
      },
    },
  });
  if (!expense) {
    return null;
  }
  const { reversedBy, ...rest } = expense;
  return { ...rest, alreadyReversed: reversedBy !== null };
}

/**
 * Writes the reversal inside `tx`. Re-checks, inside the transaction, that the
 * original has not been reversed in the meantime, so two concurrent reversals
 * cannot both succeed.
 */
export async function reverseInTransaction(
  tx: Prisma.TransactionClient,
  expense: ReversibleExpense,
  options: {
    actorUserId: string;
    reason: string;
    /** For a correction: the expense that replaces this one. */
    replacementExpenseId?: string;
  },
): Promise<string> {
  const nextStatus = statusAfterReversal(expense.status); // throws for LOCKED / REVERSED
  const raced = await tx.expense.count({ where: { reversesExpenseId: expense.id } });
  if (raced > 0) {
    throw new ExpenseStateError(
      "ILLEGAL_TRANSITION",
      "That expense has already been reversed.",
    );
  }

  const now = new Date();
  const reversal = await tx.expense.create({
    data: {
      householdId: expense.householdId,
      paidByUserId: expense.paidByUserId,
      createdByUserId: options.actorUserId,
      categoryId: expense.categoryId,
      description: `Reversal: ${expense.description}`.slice(0, 200),
      amountCents: -expense.amountCents,
      currency: expense.currency,
      date: now,
      notes: options.reason,
      splitMethod: expense.splitMethod,
      reversesExpenseId: expense.id,
      // A reversal cancels something already agreed, so it takes effect at once.
      status: "ACCEPTED",
      // The funder-sum invariant applies to every expense row, reversals included.
      funders: {
        create: expense.funders.map((funder) => ({
          userId: funder.userId,
          amountCents: -funder.amountCents,
        })),
      },
      // Negated one by one rather than recomputed, so no penny can round differently.
      splits: {
        create: expense.splits.map((split) => ({
          userId: split.userId,
          amountCents: -split.amountCents,
          percentBps: split.percentBps,
          shares: split.shares,
          acceptance: "ACCEPTED",
          acceptedAt: now,
        })),
      },
    },
    select: { id: true, amountCents: true },
  });

  await tx.expense.update({ where: { id: expense.id }, data: { status: nextStatus } });

  await writeAuditLog(tx, {
    householdId: expense.householdId,
    actorUserId: options.actorUserId,
    action: "EXPENSE_REVERSED",
    entityType: "expense",
    entityId: expense.id,
    before: { status: expense.status, amountCents: expense.amountCents },
    after: {
      status: nextStatus,
      reversalExpenseId: reversal.id,
      reversalAmountCents: reversal.amountCents,
      reason: options.reason,
      ...(options.replacementExpenseId
        ? { replacementExpenseId: options.replacementExpenseId }
        : {}),
    },
  });

  return reversal.id;
}
