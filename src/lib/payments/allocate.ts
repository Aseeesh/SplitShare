import "server-only";

import type { Prisma } from "@/generated/prisma-node/client";
import { fromDbCents, toDbCents } from "@/lib/money";
import { statusAfterPaymentConfirmed } from "@/lib/expenses/state";
import { apportion } from "@/lib/ledger/pairwise";

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
 * With several funders a share is owed to them in proportion to what each
 * funded (the same apportionment the pairwise ledger uses), so a payment to one
 * funder covers at most THAT funder's portion of the share, and the share counts
 * as settled only once every funder's portion is covered.
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
    select: {
      id: true,
      amountCents: true,
      expenseId: true,
      expense: { select: { funders: { select: { userId: true, amountCents: true } } } },
    },
    orderBy: [{ expense: { date: "asc" } }, { createdAt: "asc" }],
  });

  const touched = new Set<string>();
  const settledNow = new Set<string>();
  let allocated = 0;

  for (const share of shares) {
    if (left <= 0) break;

    // What this funder is owed out of the share, and what is already covered.
    const shareCents = fromDbCents(share.amountCents, "split amount");
    const portion =
      apportion(
        shareCents,
        share.expense.funders.map((f) => ({
          id: f.userId,
          weight: fromDbCents(f.amountCents, "funder amount"),
        })),
      ).get(payment.toUserId) ?? 0;
    if (portion <= 0) continue;

    const [linked, allocatedBefore] = await Promise.all([
      tx.payment.findMany({
        where: { expenseSplitId: share.id, confirmation: { isNot: null } },
        select: { toUserId: true, amountCents: true },
      }),
      tx.paymentAllocation.findMany({
        where: { expenseSplitId: share.id },
        select: { amountCents: true, payment: { select: { toUserId: true } } },
      }),
    ]);
    const covers = [
      ...linked.map((row) => ({
        to: row.toUserId,
        cents: fromDbCents(row.amountCents, "linked"),
      })),
      ...allocatedBefore.map((row) => ({
        to: row.payment.toUserId,
        cents: fromDbCents(row.amountCents, "allocated"),
      })),
    ];
    const coveredAll = covers.reduce((sum, c) => sum + c.cents, 0);
    const coveredToThem = covers
      .filter((c) => c.to === payment.toUserId)
      .reduce((sum, c) => sum + c.cents, 0);

    const remainingToThem = portion - coveredToThem;
    if (remainingToThem <= 0) continue;

    const take = Math.min(left, remainingToThem);
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

    if (coveredAll + take >= shareCents) {
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
