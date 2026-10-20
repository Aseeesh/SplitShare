/**
 * Pairwise debts: who owes whom, across every expense in a household.
 *
 * Balances (§12) give each person ONE net number, which is what the settle-up
 * plan uses. This answers a different question — "what is still owed between me
 * and Bob?" — by attributing each expense's debts to the people who funded it.
 * Pure and dependency-free so it can be tested exhaustively; the money rules
 * from §2 apply (integer cents, leftover cents handed out deterministically).
 */

export interface LedgerExpense {
  funders: ReadonlyArray<{ userId: string; cents: number }>;
  /** Accepted splits only. */
  splits: ReadonlyArray<{ userId: string; cents: number }>;
}

export interface LedgerPayment {
  fromUserId: string;
  toUserId: string;
  /** Confirmed payments only. May be negative for a reversal. */
  cents: number;
}

/** `debtor -> creditor -> cents`, only positive entries. */
export type DebtMatrix = Map<string, Map<string, number>>;

function add(matrix: DebtMatrix, debtor: string, creditor: string, cents: number): void {
  if (cents === 0 || debtor === creditor) return;
  const row = matrix.get(debtor) ?? new Map<string, number>();
  row.set(creditor, (row.get(creditor) ?? 0) + cents);
  matrix.set(debtor, row);
}

/**
 * Splits `total` across `weights` in proportion, with no cent lost or invented.
 *
 * Floors each share, then hands the leftover cents out one at a time to the
 * largest remainders — ties broken by userId ascending, the same determinism
 * §2.6 requires for split leftovers.
 */
export function apportion(
  total: number,
  weights: ReadonlyArray<{ id: string; weight: number }>,
): Map<string, number> {
  const sum = weights.reduce((acc, w) => acc + w.weight, 0);
  const result = new Map<string, number>();
  if (total === 0 || sum <= 0) return result;

  const parts = weights.map((w) => {
    const exact = (total * w.weight) / sum;
    const floor = Math.floor(exact);
    return { id: w.id, floor, remainder: exact - floor };
  });
  let left = total - parts.reduce((acc, p) => acc + p.floor, 0);
  [...parts]
    .sort((a, b) => b.remainder - a.remainder || (a.id < b.id ? -1 : 1))
    .forEach((p) => {
      if (left > 0) {
        p.floor += 1;
        left -= 1;
      }
    });
  for (const p of parts) {
    if (p.floor !== 0) result.set(p.id, p.floor);
  }
  return result;
}

/**
 * Debts created by expenses alone.
 *
 * Per expense, each person's position is what they funded minus what they
 * consumed. Whoever is short owes the people who are over, in proportion to how
 * much over each is — so with several funders, a participant's debt is split
 * across them rather than dumped on one.
 */
export function expenseDebts(expenses: readonly LedgerExpense[]): DebtMatrix {
  const matrix: DebtMatrix = new Map();

  for (const expense of expenses) {
    const position = new Map<string, number>();
    for (const f of expense.funders) {
      position.set(f.userId, (position.get(f.userId) ?? 0) + f.cents);
    }
    for (const s of expense.splits) {
      position.set(s.userId, (position.get(s.userId) ?? 0) - s.cents);
    }

    const creditors = [...position]
      .filter(([, v]) => v > 0)
      .map(([id, v]) => ({ id, weight: v }));
    const debtors = [...position]
      .filter(([, v]) => v < 0)
      .sort(([a], [b]) => (a < b ? -1 : 1));

    for (const [debtor, owed] of debtors) {
      for (const [creditor, cents] of apportion(-owed, creditors)) {
        add(matrix, debtor, creditor, cents);
      }
    }
  }
  return matrix;
}

/**
 * What is still outstanding in each direction, after confirmed payments.
 *
 * A payment from A to B cancels A's debt to B first; anything beyond that
 * becomes a debt in the other direction (B now owes A the overpayment), which
 * is exactly what "net" means. Nothing is hidden by clamping.
 */
export function outstandingDebts(
  expenses: readonly LedgerExpense[],
  payments: readonly LedgerPayment[],
): DebtMatrix {
  const matrix = expenseDebts(expenses);
  for (const p of payments) {
    add(matrix, p.fromUserId, p.toUserId, -p.cents);
  }

  // A negative entry means "paid more than owed": flip it into the opposite
  // debt so every remaining entry is a positive amount somebody still owes.
  for (const [debtor, row] of [...matrix]) {
    for (const [creditor, cents] of [...row]) {
      if (cents < 0) {
        row.delete(creditor);
        add(matrix, creditor, debtor, -cents);
      } else if (cents === 0) {
        row.delete(creditor);
      }
    }
  }
  return matrix;
}

export interface PairPosition {
  otherUserId: string;
  /** What the viewer still owes them, gross (not netted against what they owe back). */
  youOweCents: number;
  /** What they still owe the viewer, gross. */
  theyOweCents: number;
  /** Both directions are open, so they can be cancelled against each other. */
  cancellableCents: number;
  /** Positive: they owe you. Negative: you owe them. */
  netCents: number;
}

/** The viewer's position against every other member. */
export function pairPositions(matrix: DebtMatrix, viewerId: string): PairPosition[] {
  const others = new Set<string>();
  for (const [debtor, row] of matrix) {
    for (const creditor of row.keys()) {
      if (debtor === viewerId) others.add(creditor);
      if (creditor === viewerId) others.add(debtor);
    }
  }

  return [...others]
    .sort()
    .map((otherUserId) => {
      const youOwe = Math.max(matrix.get(viewerId)?.get(otherUserId) ?? 0, 0);
      const theyOwe = Math.max(matrix.get(otherUserId)?.get(viewerId) ?? 0, 0);
      return {
        otherUserId,
        youOweCents: youOwe,
        theyOweCents: theyOwe,
        cancellableCents: Math.min(youOwe, theyOwe),
        netCents: theyOwe - youOwe,
      };
    })
    .filter((p) => p.youOweCents > 0 || p.theyOweCents > 0);
}
