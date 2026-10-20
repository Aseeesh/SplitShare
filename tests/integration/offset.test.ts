import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createExpense } from "@/actions/expenses/create";
import { respondToSplit } from "@/actions/expenses/respond";
import { createHousehold } from "@/actions/households/create";
import { confirmPayment } from "@/actions/payments/confirm";
import { confirmOffset, proposeOffset, withdrawOffset } from "@/actions/payments/offset";
import type { ActionResult } from "@/lib/actions/result";
import { loadDebtMatrix } from "@/lib/ledger/load";
import { pairPositions } from "@/lib/ledger/pairwise";

/**
 * Members a, b, c, d. A pays for dinner; later B pays for groceries and A and C
 * share it. A still owes B from the groceries while B owes A from the dinner, so
 * the overlap can be cancelled and only the true remainder stays.
 */

const db = await connectIntegrationDatabase();
const describeDb = db ? describe : describe.skip;

afterAll(async () => {
  await db?.prisma.$disconnect();
});

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

async function user(name: string) {
  const email = `${name.toLowerCase()}@example.test`;
  const row = await db!.prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, emailVerified: new Date() },
    select: { id: true, name: true, email: true },
  });
  return { id: row.id, name: row.name!, email: row.email };
}

async function nets(householdId: string): Promise<Map<string, number>> {
  const rows = await db!.prisma.$queryRaw<
    Array<{ user_id: string; settled_net_cents: bigint }>
  >`
    SELECT user_id, settled_net_cents FROM "household_net_positions"
     WHERE household_id = ${householdId}::uuid
  `;
  return new Map(rows.map((r) => [r.user_id, Number(r.settled_net_cents)]));
}

describeDb("cancelling out what members owe each other", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  it("cancels the overlap between two members and leaves the remainder", async () => {
    const { prisma } = db!;
    const [a, b, c, d] = await Promise.all(["Ann", "Bob", "Cal", "Dee"].map(user));

    actAs(a!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    for (const m of [b!, c!, d!]) {
      await prisma.householdMember.create({
        data: { householdId, userId: m.id, role: "MEMBER" },
      });
    }

    const date = new Date("2026-10-07T00:00:00.000Z");
    const accept = async (
      who: { id: string; name: string; email: string },
      expenseId: string,
    ) => {
      actAs(who);
      expectOk(await respondToSplit({ householdId, expenseId, decision: "ACCEPTED" }));
    };

    // Dinner: Ann pays 20000, equal between all four (5000 each).
    actAs(a!);
    const dinner = expectOk(
      await createExpense({
        householdId,
        paidByUserId: a!.id,
        categoryId: null,
        description: "Dinner",
        amountCents: 20000,
        currency: "NZD",
        date,
        splitMethod: "EQUAL",
        participants: [a, b, c, d].map((u) => ({ userId: u!.id })),
      }),
    );
    for (const m of [b!, c!, d!]) await accept(m, dinner.expenseId);

    // Groceries: Bob pays 9000, equal between Ann, Bob, Cal (3000 each).
    actAs(b!);
    const groceries = expectOk(
      await createExpense({
        householdId,
        paidByUserId: b!.id,
        categoryId: null,
        description: "Groceries",
        amountCents: 9000,
        currency: "NZD",
        date,
        splitMethod: "EQUAL",
        participants: [a, b, c].map((u) => ({ userId: u!.id })),
      }),
    );
    for (const m of [a!, c!]) await accept(m, groceries.expenseId);

    const netsBefore = await nets(householdId);
    const before = pairPositions(await loadDebtMatrix(householdId), a!.id).find(
      (p) => p.otherUserId === b!.id,
    )!;
    expect(before).toMatchObject({
      youOweCents: 3000,
      theyOweCents: 5000,
      cancellableCents: 3000,
    });

    // Ann proposes; nothing changes until Bob accepts.
    actAs(a!);
    const proposal = expectOk(await proposeOffset({ householdId, withUserId: b!.id }));
    expect(proposal.amountCents).toBe(3000);
    expect(
      pairPositions(await loadDebtMatrix(householdId), a!.id).find(
        (p) => p.otherUserId === b!.id,
      )!.cancellableCents,
    ).toBe(3000);

    // The proposer cannot confirm her own proposal, and a leg cannot be confirmed alone.
    const mine = await confirmOffset({ householdId, reference: proposal.reference });
    expect(mine.ok).toBe(false);
    const leg = await prisma.payment.findFirstOrThrow({
      where: { householdId, method: "OFFSET", toUserId: b!.id },
    });
    actAs(b!);
    expect((await confirmPayment({ householdId, paymentId: leg.id })).ok).toBe(false);

    // Bob accepts: both legs confirm together.
    expectOk(await confirmOffset({ householdId, reference: proposal.reference }));

    const after = pairPositions(await loadDebtMatrix(householdId), a!.id).find(
      (p) => p.otherUserId === b!.id,
    )!;
    expect(after).toMatchObject({
      youOweCents: 0,
      theyOweCents: 2000,
      cancellableCents: 0,
    });

    // The cancelled amounts also settle the shares behind them: Ann's 3000 share of
    // the groceries is paid, so only Cal's share of it is still open.
    expect(
      (
        await prisma.expenseSplit.findFirstOrThrow({
          where: { expenseId: groceries.expenseId, userId: a!.id },
        })
      ).settledAt,
    ).not.toBeNull();
    expect(
      (await prisma.expense.findUniqueOrThrow({ where: { id: groceries.expenseId } }))
        .status,
    ).toBe("PARTIALLY_PAID");

    // Offsets move no money: every person's net is exactly what it was.
    expect(await nets(householdId)).toEqual(netsBefore);

    // Nothing left to cancel, and it cannot be confirmed twice.
    actAs(a!);
    expect((await proposeOffset({ householdId, withUserId: b!.id })).ok).toBe(false);
    actAs(b!);
    expect((await confirmOffset({ householdId, reference: proposal.reference })).ok).toBe(
      false,
    );
  });

  it("lets an unanswered proposal expire so a new one can be made", async () => {
    const { prisma } = db!;
    const [a, b] = await Promise.all(["Ann", "Bob"].map(user));
    actAs(a!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    await prisma.householdMember.create({
      data: { householdId, userId: b!.id, role: "MEMBER" },
    });

    const date = new Date("2026-10-07T00:00:00.000Z");
    const accept = async (
      who: { id: string; name: string; email: string },
      id: string,
    ) => {
      actAs(who);
      expectOk(
        await respondToSplit({ householdId, expenseId: id, decision: "ACCEPTED" }),
      );
    };
    const spend = async (payer: typeof a, cents: number, description: string) => {
      actAs(payer!);
      const e = expectOk(
        await createExpense({
          householdId,
          paidByUserId: payer!.id,
          categoryId: null,
          description,
          amountCents: cents,
          currency: "NZD",
          date,
          splitMethod: "EQUAL",
          participants: [a, b].map((u) => ({ userId: u!.id })),
        }),
      );
      await accept(payer === a ? b! : a!, e.expenseId);
    };
    await spend(a, 10000, "Dinner");
    await spend(b, 6000, "Groceries");

    // An 8-day-old proposal, written the way proposeOffset would have.
    const old = new Date(Date.now() - 8 * 86_400_000);
    const reference = `offset:${crypto.randomUUID()}:${a!.id}`;
    for (const [from, to] of [
      [a!.id, b!.id],
      [b!.id, a!.id],
    ] as const) {
      await prisma.payment.create({
        data: {
          householdId,
          fromUserId: from,
          toUserId: to,
          amountCents: 3000n,
          currency: "NZD",
          method: "OFFSET",
          reference,
          paidAt: old,
        },
      });
    }

    actAs(b!);
    expect((await confirmOffset({ householdId, reference })).ok).toBe(false);
    actAs(a!);
    expect((await proposeOffset({ householdId, withUserId: b!.id })).ok).toBe(true);
  });

  it("lets only the proposer withdraw, and only before it is accepted", async () => {
    const { prisma } = db!;
    const [a, b] = await Promise.all(["Ann", "Bob"].map(user));
    actAs(a!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    await prisma.householdMember.create({
      data: { householdId, userId: b!.id, role: "MEMBER" },
    });

    const date = new Date("2026-10-07T00:00:00.000Z");
    const spend = async (payer: typeof a, cents: number, description: string) => {
      actAs(payer!);
      const e = expectOk(
        await createExpense({
          householdId,
          paidByUserId: payer!.id,
          categoryId: null,
          description,
          amountCents: cents,
          currency: "NZD",
          date,
          splitMethod: "EQUAL",
          participants: [a, b].map((u) => ({ userId: u!.id })),
        }),
      );
      actAs(payer === a ? b! : a!);
      expectOk(
        await respondToSplit({
          householdId,
          expenseId: e.expenseId,
          decision: "ACCEPTED",
        }),
      );
    };
    await spend(a, 10000, "Dinner");
    await spend(b, 6000, "Groceries");

    actAs(a!);
    const first = expectOk(await proposeOffset({ householdId, withUserId: b!.id }));

    // The other person cannot withdraw someone else's proposal.
    actAs(b!);
    expect((await withdrawOffset({ householdId, reference: first.reference })).ok).toBe(
      false,
    );

    // The proposer can; afterwards it cannot be accepted, and a new one can be made.
    actAs(a!);
    expectOk(await withdrawOffset({ householdId, reference: first.reference }));
    actAs(b!);
    expect((await confirmOffset({ householdId, reference: first.reference })).ok).toBe(
      false,
    );
    actAs(a!);
    expect((await withdrawOffset({ householdId, reference: first.reference })).ok).toBe(
      false,
    );
    const second = expectOk(await proposeOffset({ householdId, withUserId: b!.id }));

    // Reversal rows are inert: nothing was ever confirmed, so no balances moved.
    const reversals = await prisma.payment.count({
      where: { householdId, method: "OFFSET", reversesPaymentId: { not: null } },
    });
    expect(reversals).toBe(2);

    // Once accepted it is final.
    actAs(b!);
    expectOk(await confirmOffset({ householdId, reference: second.reference }));
    actAs(a!);
    expect((await withdrawOffset({ householdId, reference: second.reference })).ok).toBe(
      false,
    );
  });
});
