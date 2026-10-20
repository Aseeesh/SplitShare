import "server-only";

import type { Prisma } from "@/generated/prisma-node/client";
import { fromDbCents, toDbCents } from "@/lib/money";
import { statusAfterPaymentConfirmed } from "@/lib/expenses/state";

/**
 * Applies a just-confirmed payment to the payer's shares.
 *
 * A payment recorded without naming a share (which is what the UI does: you pick
 * a person and an amount) would otherwise never settle anything, so an expense
 * could never reach PAID and could never be locked. Here it settles the payer's
 * OLDEST unsettled shares that the recipient funded, first come first served,
 * until the money runs out. A payment can cover several shares, or part of one;
 * each piece is recorded as a `payment_allocations` row, since the payment row
 * itself is immutable.
 *
 * Runs inside the confirming transaction, so the confirmation, the allocations,
 * the share settlements and the expense status changes commit together.
 *
 * Money beyond what the payer owes the recipient is not allocated; it stays in
 * the balances as a credit (§12), which is the truth of an overpayment.
 */
export async function allocateConfirmedPayment(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    householdId: string;
    fromUserId: string;
    toUserId: string;
    amountCents: bigint;
  },
  now: Date,
): Promise<{ allocatedCents: number }> {
  let left = fromDbCents(payment.amountCents, "payment amount");
  if (left <= 0) {
    return { allocatedCents: 0 };
  }

  const shares = await tx.expenseSplit.findMany({
    where: {
      userId: payment.fromUserId,
      acceptance: "ACCEPTED",
      settledAt: null,
      expense: {
        householdId: payment.householdId,
        reversesExpenseId: null,
        status: { in: ["ACCEPTED", "PARTIALLY_PAID"] },
        funders: { some: { userId: payment.toUserId } },
      },
    },
    select: { id: true, amountCents: true, expenseId: true },
    orderBy: [{ expense: { date: "asc" } }, { createdAt: "asc" }],
  });

  const touched = new Set<string>();
  const settledNow = new Set<string>();
  let allocated = 0;

  for (const share of shares) {
    if (left <= 0) break;

    // Already covered by earlier confirmed payments, linked or allocated.
    const [linked, allocatedBefore] = await Promise.all([
      tx.payment.aggregate({
        where: { expenseSplitId: share.id, confirmation: { isNot: null } },
        _sum: { amountCents: true },
      }),
      tx.paymentAllocation.aggregate({
        where: { expenseSplitId: share.id },
        _sum: { amountCents: true },
      }),
    ]);
    const covered =
      fromDbCents(linked._sum.amountCents ?? 0n, "linked total") +
      fromDbCents(allocatedBefore._sum.amountCents ?? 0n, "allocated total");
    const remaining = fromDbCents(share.amountCents, "split amount") - covered;
    if (remaining <= 0) continue;

    const take = Math.min(left, remaining);
    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        expenseSplitId: share.id,
        amountCents: toDbCents(take, "allocation"),
      },
    });
    left -= take;
    allocated += take;
    touched.add(share.expenseId);

    if (take >= remaining) {
      await tx.expenseSplit.update({ where: { id: share.id }, data: { settledAt: now } });
      settledNow.add(share.id);
    }
  }

  // Move each affected expense along the §7 machine.
  for (const expenseId of touched) {
    const expense = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      select: {
        id: true,
        status: true,
        splits: { select: { id: true, settledAt: true } },
      },
    });
    const allSettled = expense.splits.every(
      (split) => split.settledAt !== null || settledNow.has(split.id),
    );
    const target = statusAfterPaymentConfirmed(expense.status, {
      allSplitsSettled: allSettled,
    });
    if (target !== expense.status) {
      await tx.expense.update({ where: { id: expense.id }, data: { status: target } });
    }
  }

  return { allocatedCents: allocated };
}
