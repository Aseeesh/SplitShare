import { requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { fromDbCents, minorUnitDigits } from "@/lib/money";

/** Escapes a cell for CSV (RFC 4180). */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function amountString(cents: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return (cents / 10 ** digits).toFixed(digits);
}

/**
 * Exports a household's expense ledger as CSV. The household's own money rules
 * apply: reversal rows stay visible (they are part of the record), and the
 * caller must be a member.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ householdId: string }> },
): Promise<Response> {
  const { householdId } = await params;
  const membership = await requireHouseholdMember(householdId);

  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { name: true, currency: true },
  });

  const expenses = await prisma.expense.findMany({
    where: { householdId },
    orderBy: { date: "desc" },
    select: {
      date: true,
      description: true,
      amountCents: true,
      currency: true,
      splitMethod: true,
      status: true,
      paidBy: { select: { name: true, email: true } },
      category: { select: { name: true } },
      splits: { select: { userId: true, amountCents: true } },
    },
  });

  const header = [
    "Date",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Paid by",
    "Split method",
    "Status",
    "Your share",
  ];
  const rows = expenses.map((expense) => {
    const yours = expense.splits.find((split) => split.userId === membership.userId);
    return [
      expense.date.toISOString().slice(0, 10),
      escapeCsv(expense.description),
      escapeCsv(expense.category?.name ?? ""),
      amountString(fromDbCents(expense.amountCents), expense.currency),
      expense.currency,
      escapeCsv(expense.paidBy.name ?? expense.paidBy.email),
      expense.splitMethod,
      expense.status,
      yours ? amountString(fromDbCents(yours.amountCents), expense.currency) : "",
    ].join(",");
  });

  const csv = `﻿${[header.join(","), ...rows].join("\n")}`;
  const filename = `${household.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-expenses.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
