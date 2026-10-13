import "server-only";

import { addDays, addMonths, addYears } from "date-fns";

import type { RecurrenceFrequency } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { deriveAcceptanceStatus } from "@/lib/expenses/state";
import { splitStartsAccepted } from "@/lib/households/placeholders";
import { fromDbCents, toDbCents } from "@/lib/money";
import { computeSplits } from "@/lib/splits/engine";

function advance(nextRunAt: Date, frequency: RecurrenceFrequency): Date {
  switch (frequency) {
    case "WEEKLY":
      return addDays(nextRunAt, 7);
    case "FORTNIGHTLY":
      return addDays(nextRunAt, 14);
    case "MONTHLY":
      return addMonths(nextRunAt, 1);
    case "YEARLY":
      return addYears(nextRunAt, 1);
    default:
      return nextRunAt;
  }
}

/**
 * Materialises every recurring expense whose next run date is due, then rolls
 * its schedule forward. Idempotent: each template advances exactly once, so a
 * replay does not double up (§18's pattern, applied to expenses).
 *
 * Splits follow the same acceptance rules as a hand-entered expense — the payer
 * and any placeholders start accepted, everyone else is pending.
 */
export async function generateDueRecurringExpenses(now = new Date()): Promise<number> {
  const due = await prisma.recurringExpense.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    include: {
      household: {
        select: {
          members: {
            where: { removedAt: null },
            select: { userId: true, user: { select: { isPlaceholder: true } } },
          },
        },
      },
    },
  });

  let generated = 0;
  for (const recurring of due) {
    const members = recurring.household.members;
    const computed = computeSplits({
      method: recurring.splitMethod,
      totalCents: fromDbCents(recurring.amountCents),
      participants: members.map((member) => ({ userId: member.userId })),
    });

    const isPlaceholderById = new Map(
      members.map((member) => [member.userId, member.user.isPlaceholder]),
    );
    const splits = computed.map((split) => ({
      ...split,
      accepted: splitStartsAccepted({
        participantUserId: split.userId,
        paidByUserId: recurring.paidByUserId,
        createdByUserId: recurring.createdByUserId,
        isPlaceholder: isPlaceholderById.get(split.userId) ?? false,
      }),
    }));
    const status = deriveAcceptanceStatus({
      total: splits.length,
      accepted: splits.filter((split) => split.accepted).length,
      rejected: 0,
    });

    await prisma.$transaction(async (tx) => {
      await tx.expense.create({
        data: {
          householdId: recurring.householdId,
          paidByUserId: recurring.paidByUserId,
          createdByUserId: recurring.createdByUserId,
          categoryId: recurring.categoryId,
          description: recurring.description,
          amountCents: recurring.amountCents,
          currency: recurring.currency,
          date: recurring.nextRunAt,
          splitMethod: recurring.splitMethod,
          status,
          splits: {
            create: splits.map((split) => ({
              userId: split.userId,
              amountCents: toDbCents(split.amountCents),
              acceptance: split.accepted ? "ACCEPTED" : "PENDING",
              acceptedAt: split.accepted ? new Date() : null,
            })),
          },
        },
      });

      await tx.recurringExpense.update({
        where: { id: recurring.id },
        data: { nextRunAt: advance(recurring.nextRunAt, recurring.frequency) },
      });
    });

    generated += 1;
  }

  return generated;
}
