import "server-only";

import { requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { fromDbCents } from "@/lib/money";

/**
 * Read models for the spending charts. Reversal rows are excluded (they are
 * corrections, not spending), and only positive amounts are summed.
 */

export interface CategorySpend {
  name: string;
  colorHex: string;
  totalCents: number;
}

export async function getSpendingByCategory(
  householdId: string,
): Promise<CategorySpend[]> {
  await requireHouseholdMember(householdId);

  const grouped = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: { householdId, reversesExpenseId: null, amountCents: { gt: 0 } },
    _sum: { amountCents: true },
  });

  const categoryIds = grouped
    .map((row) => row.categoryId)
    .filter((id): id is string => id !== null);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, colorHex: true },
  });
  const byId = new Map(categories.map((category) => [category.id, category]));

  return grouped
    .filter((row) => row.categoryId !== null)
    .map((row) => {
      const category = byId.get(row.categoryId as string);
      return {
        name: category?.name ?? "Uncategorised",
        colorHex: category?.colorHex ?? "#94a3b8",
        totalCents: fromDbCents(row._sum.amountCents ?? 0n),
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

export interface MonthlySpend {
  /** "YYYY-MM", for stable ordering and axis labels. */
  month: string;
  totalCents: number;
}

export async function getMonthlySpending(householdId: string): Promise<MonthlySpend[]> {
  await requireHouseholdMember(householdId);

  const rows = await prisma.$queryRaw<Array<{ month: string; total: bigint }>>`
    SELECT to_char(date, 'YYYY-MM') AS month, COALESCE(SUM(amount_cents), 0) AS total
      FROM expenses
     WHERE household_id = ${householdId}::uuid
       AND reverses_expense_id IS NULL
       AND amount_cents > 0
     GROUP BY 1
     ORDER BY 1 ASC
  `;

  return rows.map((row) => ({ month: row.month, totalCents: fromDbCents(row.total) }));
}
