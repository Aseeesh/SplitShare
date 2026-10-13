import "server-only";

import type { RecurrenceFrequency } from "@/generated/prisma/enums";
import { requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { fromDbCents } from "@/lib/money";

export interface RecurringExpenseItem {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  frequency: RecurrenceFrequency;
  nextRunAt: Date;
  active: boolean;
  paidByName: string;
}

export async function listRecurringExpenses(
  householdId: string,
): Promise<RecurringExpenseItem[]> {
  await requireHouseholdMember(householdId);

  const recurring = await prisma.recurringExpense.findMany({
    where: { householdId },
    select: {
      id: true,
      description: true,
      amountCents: true,
      currency: true,
      frequency: true,
      nextRunAt: true,
      active: true,
      paidBy: { select: { name: true, email: true } },
    },
    orderBy: { nextRunAt: "asc" },
  });

  return recurring.map((item) => ({
    id: item.id,
    description: item.description,
    amountCents: fromDbCents(item.amountCents),
    currency: item.currency,
    frequency: item.frequency,
    nextRunAt: item.nextRunAt,
    active: item.active,
    paidByName: item.paidBy.name ?? item.paidBy.email,
  }));
}
