import "server-only";

import { cache } from "react";

import { requireAuth, requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { isPlaceholderEmail } from "@/lib/households/placeholders";
import { fromDbCents } from "@/lib/money";

/**
 * Read models for the personal overview: everything here is scoped to the
 * signed-in user and to ACTIVE households they are a current member of, so a
 * deactivated or former organisation never leaks into totals.
 *
 * "Spend" is the caller's own accepted share of countable expenses (the same
 * set §12 counts: reversal rows excluded, only ACCEPTED-and-later statuses), so
 * these figures agree with the balances rather than competing with them.
 */

const COUNTABLE = `('ACCEPTED','PARTIALLY_PAID','PAID','LOCKED')`;

export interface PeriodSpend {
  /** ISO date of the period start, "YYYY-MM-DD". */
  period: string;
  cents: number;
}

export interface HouseholdOverview {
  id: string;
  name: string;
  currency: string;
  role: string;
  memberCount: number;
  monthSpendCents: number;
  weekSpendCents: number;
  /** Positive: others owe you here. Negative: you owe. */
  netCents: number;
}

export interface Overview {
  /** Per-currency would be more precise; the app keeps one currency per household. */
  currency: string | null;
  mixedCurrencies: boolean;
  weekSpendCents: number;
  monthSpendCents: number;
  weekly: PeriodSpend[];
  monthly: PeriodSpend[];
  /** Confirmed payments received, all time. */
  incomeReceivedCents: number;
  /** Still owed to you across all active households. */
  incomePendingCents: number;
  /** What you still owe others. */
  youOweCents: number;
  households: HouseholdOverview[];
}

export const getOverview = cache(async (): Promise<Overview> => {
  const user = await requireAuth();

  const memberships = await prisma.householdMember.findMany({
    where: { userId: user.id, removedAt: null, household: { status: "ACTIVE" } },
    select: {
      role: true,
      household: {
        select: {
          id: true,
          name: true,
          currency: true,
          _count: { select: { members: { where: { removedAt: null } } } },
        },
      },
    },
    orderBy: { household: { name: "asc" } },
  });
  const ids = memberships.map((m) => m.household.id);
  const currencies = new Set(memberships.map((m) => m.household.currency));

  if (ids.length === 0) {
    return {
      currency: null,
      mixedCurrencies: false,
      weekSpendCents: 0,
      monthSpendCents: 0,
      weekly: [],
      monthly: [],
      incomeReceivedCents: 0,
      incomePendingCents: 0,
      youOweCents: 0,
      households: [],
    };
  }

  const [weeklyRows, monthlyRows, perHousehold, netRows, received] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ period: Date; cents: bigint }>>(
      `SELECT date_trunc('week', e.date)::date AS period, SUM(s.amount_cents) AS cents
         FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
        WHERE s.user_id = $1::uuid AND s.acceptance = 'ACCEPTED'
          AND e.household_id = ANY($2::uuid[]) AND e.reverses_expense_id IS NULL
          AND e.status IN ${COUNTABLE}
          AND e.date >= date_trunc('week', now()) - interval '7 weeks'
        GROUP BY 1 ORDER BY 1`,
      user.id,
      ids,
    ),
    prisma.$queryRawUnsafe<Array<{ period: Date; cents: bigint }>>(
      `SELECT date_trunc('month', e.date)::date AS period, SUM(s.amount_cents) AS cents
         FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
        WHERE s.user_id = $1::uuid AND s.acceptance = 'ACCEPTED'
          AND e.household_id = ANY($2::uuid[]) AND e.reverses_expense_id IS NULL
          AND e.status IN ${COUNTABLE}
          AND e.date >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1 ORDER BY 1`,
      user.id,
      ids,
    ),
    prisma.$queryRawUnsafe<
      Array<{ household_id: string; week_cents: bigint; month_cents: bigint }>
    >(
      `SELECT e.household_id,
              COALESCE(SUM(s.amount_cents) FILTER (WHERE e.date >= date_trunc('week', now())), 0) AS week_cents,
              COALESCE(SUM(s.amount_cents) FILTER (WHERE e.date >= date_trunc('month', now())), 0) AS month_cents
         FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
        WHERE s.user_id = $1::uuid AND s.acceptance = 'ACCEPTED'
          AND e.household_id = ANY($2::uuid[]) AND e.reverses_expense_id IS NULL
          AND e.status IN ${COUNTABLE}
        GROUP BY 1`,
      user.id,
      ids,
    ),
    prisma.$queryRaw<Array<{ household_id: string; settled_net_cents: bigint }>>`
      SELECT household_id, settled_net_cents
        FROM "household_net_positions"
       WHERE user_id = ${user.id}::uuid
    `,
    prisma.$queryRaw<Array<{ cents: bigint | null }>>`
      SELECT COALESCE(SUM(p.amount_cents), 0) AS cents
        FROM payments p
        JOIN payment_confirmations c ON c.payment_id = p.id
       WHERE p.to_user_id = ${user.id}::uuid
         AND p.household_id = ANY(${ids}::uuid[])
    `,
  ]);

  const spendBy = new Map(perHousehold.map((r) => [r.household_id, r]));
  const netBy = new Map(
    netRows.map((r) => [r.household_id, fromDbCents(r.settled_net_cents)]),
  );

  const households: HouseholdOverview[] = memberships.map((m) => {
    const spend = spendBy.get(m.household.id);
    return {
      id: m.household.id,
      name: m.household.name,
      currency: m.household.currency,
      role: m.role,
      memberCount: m.household._count.members,
      weekSpendCents: spend ? fromDbCents(spend.week_cents) : 0,
      monthSpendCents: spend ? fromDbCents(spend.month_cents) : 0,
      netCents: netBy.get(m.household.id) ?? 0,
    };
  });

  const sum = (f: (h: HouseholdOverview) => number) =>
    households.reduce((total, h) => total + f(h), 0);

  const toPeriods = (rows: Array<{ period: Date; cents: bigint }>): PeriodSpend[] =>
    rows.map((r) => ({
      period: new Date(r.period).toISOString().slice(0, 10),
      cents: fromDbCents(r.cents),
    }));

  return {
    currency: currencies.size === 1 ? [...currencies][0]! : null,
    mixedCurrencies: currencies.size > 1,
    weekSpendCents: sum((h) => h.weekSpendCents),
    monthSpendCents: sum((h) => h.monthSpendCents),
    weekly: toPeriods(weeklyRows),
    monthly: toPeriods(monthlyRows),
    incomeReceivedCents: fromDbCents(received[0]?.cents ?? 0n),
    incomePendingCents: sum((h) => Math.max(h.netCents, 0)),
    youOweCents: sum((h) => Math.max(-h.netCents, 0)),
    households,
  };
});

export interface ActivityItem {
  id: string;
  kind: "expense" | "payment";
  householdId: string;
  householdName: string;
  title: string;
  amountCents: number;
  currency: string;
  at: Date;
}

/** Latest expenses and confirmed payments across the caller's active households. */
export const listRecentActivity = cache(async (limit = 12): Promise<ActivityItem[]> => {
  const user = await requireAuth();
  const where = {
    household: {
      status: "ACTIVE" as const,
      members: { some: { userId: user.id, removedAt: null } },
    },
  };

  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({
      where: { ...where, reversesExpenseId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        createdAt: true,
        household: { select: { id: true, name: true } },
        paidBy: { select: { name: true, email: true } },
      },
    }),
    prisma.payment.findMany({
      where: { ...where, amountCents: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amountCents: true,
        currency: true,
        createdAt: true,
        household: { select: { id: true, name: true } },
        fromUser: { select: { name: true, email: true } },
        toUser: { select: { name: true, email: true } },
      },
    }),
  ]);

  const nameOf = (u: { name: string | null; email: string }) => u.name ?? u.email;
  const items: ActivityItem[] = [
    ...expenses.map((e) => ({
      id: e.id,
      kind: "expense" as const,
      householdId: e.household.id,
      householdName: e.household.name,
      title: `${nameOf(e.paidBy)} paid for ${e.description}`,
      amountCents: fromDbCents(e.amountCents),
      currency: e.currency,
      at: e.createdAt,
    })),
    ...payments.map((p) => ({
      id: p.id,
      kind: "payment" as const,
      householdId: p.household.id,
      householdName: p.household.name,
      title: `${nameOf(p.fromUser)} paid ${nameOf(p.toUser)}`,
      amountCents: fromDbCents(p.amountCents),
      currency: p.currency,
      at: p.createdAt,
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
});

export interface PersonSuggestion {
  userId: string;
  name: string | null;
  email: string;
  /** Names of the organisations you have shared with them. */
  sharedHouseholds: string[];
}

/**
 * People you currently share an ACTIVE organisation with, ranked by how many
 * you share. This is the only source of names and emails the invite and
 * new-group autocompletes may show, so it deliberately never reaches beyond
 * your own current memberships: a group you left, or one that is archived or
 * suspended, reveals nobody. `excludeHouseholdId` hides people already in the
 * group being invited into.
 */
async function knownPeople(
  userId: string,
  excludeHouseholdId: string | null,
): Promise<PersonSuggestion[]> {
  const mine = await prisma.householdMember.findMany({
    where: { userId, removedAt: null, household: { status: "ACTIVE" } },
    select: { householdId: true },
  });
  if (mine.length === 0) {
    return [];
  }

  const [candidates, current] = await Promise.all([
    prisma.householdMember.findMany({
      where: {
        householdId: { in: mine.map((m) => m.householdId) },
        removedAt: null,
        userId: { not: userId },
        user: { isPlaceholder: false, disabledAt: null },
      },
      select: {
        household: { select: { name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    excludeHouseholdId === null
      ? Promise.resolve([])
      : prisma.householdMember.findMany({
          where: { householdId: excludeHouseholdId, removedAt: null },
          select: { userId: true },
        }),
  ]);

  const excluded = new Set(current.map((m) => m.userId));
  const byUser = new Map<string, PersonSuggestion>();
  for (const row of candidates) {
    if (excluded.has(row.user.id) || isPlaceholderEmail(row.user.email)) {
      continue;
    }
    const entry = byUser.get(row.user.id) ?? {
      userId: row.user.id,
      name: row.user.name,
      email: row.user.email,
      sharedHouseholds: [],
    };
    if (!entry.sharedHouseholds.includes(row.household.name)) {
      entry.sharedHouseholds.push(row.household.name);
    }
    byUser.set(row.user.id, entry);
  }

  return [...byUser.values()]
    .sort(
      (a, b) =>
        b.sharedHouseholds.length - a.sharedHouseholds.length ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
    )
    .slice(0, 100);
}

/** For inviting into an existing group. Gated on MANAGE_MEMBERS: it exposes emails. */
export async function listSuggestedPeople(
  householdId: string,
): Promise<PersonSuggestion[]> {
  const membership = await requireCapability(householdId, "MANAGE_MEMBERS");
  return knownPeople(membership.userId, householdId);
}

/**
 * For starting a new group. Any signed-in user may call it: it shows only
 * people already visible to them as fellow members of their own groups.
 */
export async function listKnownPeople(): Promise<PersonSuggestion[]> {
  const user = await requireAuth();
  return knownPeople(user.id, null);
}
