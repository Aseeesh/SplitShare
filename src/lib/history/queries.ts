import "server-only";

import type { ExpenseStatus, PaymentStatus } from "@/generated/prisma/enums";
import { requireHouseholdMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { fromDbCents } from "@/lib/money";

/**
 * A combined, chronological activity feed for a household: expenses and
 * payments interleaved. Reversal rows are excluded — they are corrections, not
 * history the group reads as "what happened".
 */

export interface HistoryEntry {
  id: string;
  kind: "expense" | "payment";
  date: Date;
  amountCents: number;
  currency: string;
  status: ExpenseStatus | PaymentStatus;
  hasReceipt: boolean;
  /** Primary line: who did what ("Ann paid" / "Bob → Ann"). */
  title: string;
  /** Secondary line: the expense description or the payment note. */
  subtitle: string | null;
  /** The actor's name — the payer for an expense, the sender for a payment. */
  actorName: string;
  /** The recipient's name, for payments only. */
  targetName: string | null;
}

export async function listHouseholdHistory(
  householdId: string,
  limit = 50,
): Promise<HistoryEntry[]> {
  await requireHouseholdMember(householdId);

  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({
      where: { householdId, reversesExpenseId: null },
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        date: true,
        status: true,
        receiptFileId: true,
        paidBy: { select: { name: true, email: true } },
      },
      orderBy: { date: "desc" },
      take: limit,
    }),
    prisma.payment.findMany({
      where: { householdId, reversesPaymentId: null, reversedBy: { is: null } },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        paidAt: true,
        note: true,
        fromUser: { select: { name: true, email: true } },
        toUser: { select: { name: true, email: true } },
      },
      orderBy: { paidAt: "desc" },
      take: limit,
    }),
  ]);

  // Payment status is derived from the view (§9), not stored on the row.
  const statusById = new Map<string, PaymentStatus>();
  if (payments.length > 0) {
    const rows = await prisma.$queryRaw<{ id: string; status: PaymentStatus }[]>`
      SELECT id, status FROM "payment_states" WHERE household_id = ${householdId}::uuid
    `;
    for (const row of rows) statusById.set(row.id, row.status);
  }

  const entries: HistoryEntry[] = [
    ...expenses.map((e): HistoryEntry => ({
      id: e.id,
      kind: "expense",
      date: e.date,
      amountCents: fromDbCents(e.amountCents, "expense total"),
      currency: e.currency,
      status: e.status,
      hasReceipt: e.receiptFileId !== null,
      title: `${e.paidBy.name ?? e.paidBy.email} paid`,
      subtitle: e.description,
      actorName: e.paidBy.name ?? e.paidBy.email,
      targetName: null,
    })),
    ...payments.map((p): HistoryEntry => {
      const from = p.fromUser.name ?? p.fromUser.email;
      const to = p.toUser.name ?? p.toUser.email;
      return {
        id: p.id,
        kind: "payment",
        date: p.paidAt,
        amountCents: fromDbCents(p.amountCents, "payment amount"),
        currency: p.currency,
        status: statusById.get(p.id) ?? "PENDING_CONFIRMATION",
        hasReceipt: false,
        title: `${from} → ${to}`,
        subtitle: p.note,
        actorName: from,
        targetName: to,
      };
    }),
  ];

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
