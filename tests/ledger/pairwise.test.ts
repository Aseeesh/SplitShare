import { describe, expect, it } from "vitest";

import {
  apportion,
  expenseDebts,
  outstandingDebts,
  pairPositions,
  type DebtMatrix,
} from "@/lib/ledger/pairwise";

const get = (m: DebtMatrix, d: string, c: string) => m.get(d)?.get(c) ?? 0;

describe("apportion", () => {
  it("never loses or invents a cent", () => {
    const parts = apportion(100, [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 1 },
    ]);
    expect([...parts.values()].reduce((x, y) => x + y, 0)).toBe(100);
  });

  it("hands leftover cents to the largest remainders, ties by id", () => {
    const parts = apportion(100, [
      { id: "c", weight: 1 },
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
    ]);
    expect(parts.get("a")).toBe(34);
    expect(parts.get("b")).toBe(33);
    expect(parts.get("c")).toBe(33);
  });

  it("returns nothing for a zero total or no weight", () => {
    expect(apportion(0, [{ id: "a", weight: 1 }]).size).toBe(0);
    expect(apportion(10, []).size).toBe(0);
  });
});

describe("expenseDebts", () => {
  it("attributes a single funder's expense to each other participant", () => {
    // A paid 9000, equal between A, B, C.
    const m = expenseDebts([
      {
        funders: [{ userId: "A", cents: 9000 }],
        splits: [
          { userId: "A", cents: 3000 },
          { userId: "B", cents: 3000 },
          { userId: "C", cents: 3000 },
        ],
      },
    ]);
    expect(get(m, "B", "A")).toBe(3000);
    expect(get(m, "C", "A")).toBe(3000);
    expect(get(m, "A", "B")).toBe(0);
  });

  it("splits one debtor's debt across several funders in proportion", () => {
    // A funds 600, B funds 400; C consumes all 1000.
    const m = expenseDebts([
      {
        funders: [
          { userId: "A", cents: 600 },
          { userId: "B", cents: 400 },
        ],
        splits: [{ userId: "C", cents: 1000 }],
      },
    ]);
    expect(get(m, "C", "A")).toBe(600);
    expect(get(m, "C", "B")).toBe(400);
  });

  it("matches the worked §12 example", () => {
    // Ann pays 9000, Bob pays 6000; all equal between Ann, Bob, Cal.
    const m = expenseDebts([
      {
        funders: [{ userId: "Ann", cents: 9000 }],
        splits: ["Ann", "Bob", "Cal"].map((userId) => ({ userId, cents: 3000 })),
      },
      {
        funders: [{ userId: "Bob", cents: 6000 }],
        splits: ["Ann", "Bob", "Cal"].map((userId) => ({ userId, cents: 2000 })),
      },
    ]);
    expect(get(m, "Bob", "Ann")).toBe(3000);
    expect(get(m, "Ann", "Bob")).toBe(2000);
    expect(get(m, "Cal", "Ann")).toBe(3000);
    expect(get(m, "Cal", "Bob")).toBe(2000);
  });
});

describe("the scenario: a, b, c, d and cancelling out", () => {
  // A paid dinner (B, C, D owe A 5000 each). Later B paid groceries and C's share is 3000.
  const expenses = [
    {
      funders: [{ userId: "A", cents: 20000 }],
      splits: ["A", "B", "C", "D"].map((userId) => ({ userId, cents: 5000 })),
    },
    {
      funders: [{ userId: "B", cents: 9000 }],
      splits: [
        { userId: "A", cents: 3000 },
        { userId: "B", cents: 3000 },
        { userId: "C", cents: 3000 },
      ],
    },
  ];

  it("shows both directions between A and B as open debts", () => {
    const pos = pairPositions(outstandingDebts(expenses, []), "A");
    const withB = pos.find((p) => p.otherUserId === "B")!;
    expect(withB.youOweCents).toBe(3000);
    expect(withB.theyOweCents).toBe(5000);
    expect(withB.cancellableCents).toBe(3000);
    expect(withB.netCents).toBe(2000);
  });

  it("leaves only the true remainder once the overlap is cancelled", () => {
    // Cancelling = A pays B 3000 and B pays A 3000, both confirmed.
    const after = outstandingDebts(expenses, [
      { fromUserId: "A", toUserId: "B", cents: 3000 },
      { fromUserId: "B", toUserId: "A", cents: 3000 },
    ]);
    const withB = pairPositions(after, "A").find((p) => p.otherUserId === "B")!;
    expect(withB.youOweCents).toBe(0);
    expect(withB.theyOweCents).toBe(2000);
    expect(withB.cancellableCents).toBe(0);
  });

  it("treats an overpayment as a debt the other way, not a lost cent", () => {
    const m = outstandingDebts(
      [
        {
          funders: [{ userId: "A", cents: 1000 }],
          splits: [{ userId: "B", cents: 1000 }],
        },
      ],
      [{ fromUserId: "B", toUserId: "A", cents: 1500 }],
    );
    expect(get(m, "A", "B")).toBe(500);
  });
});
