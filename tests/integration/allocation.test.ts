import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createExpense } from "@/actions/expenses/create";
import { respondToSplit } from "@/actions/expenses/respond";
import { createHousehold } from "@/actions/households/create";
import { confirmPayment } from "@/actions/payments/confirm";
import { recordPayment } from "@/actions/payments/record";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Payments recorded the way the UI records them — a person and an amount, no
 * share named — must still settle shares and move expenses to PAID.
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

describeDb("applying payments to shares", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  async function setup() {
    const { prisma } = db!;
    const [ann, bob] = await Promise.all(["Ann", "Bob"].map(user));
    actAs(ann!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    await prisma.householdMember.create({
      data: { householdId, userId: bob!.id, role: "MEMBER" },
    });

    /** Ann pays `cents`, split equally with Bob, and Bob accepts. */
    const annPays = async (cents: number, description: string, date: string) => {
      actAs(ann!);
      const e = expectOk(
        await createExpense({
          householdId,
          paidByUserId: ann!.id,
          categoryId: null,
          description,
          amountCents: cents,
          currency: "NZD",
          date: new Date(`${date}T00:00:00.000Z`),
          splitMethod: "EQUAL",
          participants: [{ userId: ann!.id }, { userId: bob!.id }],
        }),
      );
      actAs(bob!);
      expectOk(
        await respondToSplit({
          householdId,
          expenseId: e.expenseId,
          decision: "ACCEPTED",
        }),
      );
      return e.expenseId;
    };
    /** Bob pays Ann `cents` with no share named, and Ann confirms. */
    const bobPaysAnn = async (cents: number) => {
      actAs(bob!);
      const { paymentId } = expectOk(
        await recordPayment({
          householdId,
          toUserId: ann!.id,
          amountCents: cents,
          currency: "NZD",
        }),
      );
      actAs(ann!);
      expectOk(await confirmPayment({ householdId, paymentId }));
    };
    const status = async (id: string) =>
      (await prisma.expense.findUniqueOrThrow({ where: { id } })).status;
    return { prisma, ann: ann!, bob: bob!, householdId, annPays, bobPaysAnn, status };
  }

  it("moves an expense to PARTIALLY_PAID, then PAID, as Bob pays in instalments", async () => {
    const { annPays, bobPaysAnn, status } = await setup();
    const dinner = await annPays(10000, "Dinner", "2026-10-01"); // Bob owes 5000

    await bobPaysAnn(2000);
    expect(await status(dinner)).toBe("PARTIALLY_PAID");

    await bobPaysAnn(3000);
    expect(await status(dinner)).toBe("PAID");
  });

  it("pays the oldest expense first", async () => {
    const { annPays, bobPaysAnn, status } = await setup();
    const older = await annPays(10000, "Older", "2026-09-01"); // Bob owes 5000
    const newer = await annPays(6000, "Newer", "2026-10-01"); // Bob owes 3000

    await bobPaysAnn(6000);
    expect(await status(older)).toBe("PAID"); // 5000 fully
    expect(await status(newer)).toBe("PARTIALLY_PAID"); // 1000 of 3000
  });

  it("keeps an overpayment as a credit rather than losing or inventing money", async () => {
    const { prisma, ann, bob, householdId, annPays, bobPaysAnn, status } = await setup();
    const dinner = await annPays(10000, "Dinner", "2026-10-01"); // Bob owes 5000

    await bobPaysAnn(6000);
    expect(await status(dinner)).toBe("PAID");

    const allocated = await prisma.paymentAllocation.aggregate({
      _sum: { amountCents: true },
    });
    expect(Number(allocated._sum.amountCents)).toBe(5000);

    const net = await nets(householdId);
    expect(net.get(bob.id)).toBe(1000); // Bob overpaid, so Ann owes him 1000
    expect(net.get(ann.id)).toBe(-1000);
  });

  it("never lets allocations be edited or removed", async () => {
    const { prisma, annPays, bobPaysAnn } = await setup();
    await annPays(10000, "Dinner", "2026-10-01");
    await bobPaysAnn(5000);
    await expect(
      prisma.$executeRawUnsafe('DELETE FROM "payment_allocations"'),
    ).rejects.toThrow();
  });

  it("caps a payment at each funder's portion, and settles only when every funder is paid", async () => {
    const { prisma } = db!;
    const [ann, bob, cal] = await Promise.all(["Ann", "Bob", "Cal"].map(user));
    actAs(ann!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    for (const m of [bob!, cal!]) {
      await prisma.householdMember.create({
        data: { householdId, userId: m.id, role: "MEMBER" },
      });
    }

    // Ann funds 6000 and Bob 4000 of a 10000 expense that only Cal consumes.
    const created = expectOk(
      await createExpense({
        householdId,
        paidByUserId: ann!.id,
        categoryId: null,
        description: "Shared deposit",
        amountCents: 10000,
        currency: "NZD",
        date: new Date("2026-10-01T00:00:00.000Z"),
        splitMethod: "EQUAL",
        participants: [{ userId: cal!.id }],
        funders: [
          { userId: ann!.id, amountCents: 6000 },
          { userId: bob!.id, amountCents: 4000 },
        ],
      }),
    );
    actAs(cal!);
    expectOk(
      await respondToSplit({
        householdId,
        expenseId: created.expenseId,
        decision: "ACCEPTED",
      }),
    );

    const calPays = async (to: typeof ann, cents: number) => {
      actAs(cal!);
      const { paymentId } = expectOk(
        await recordPayment({
          householdId,
          toUserId: to!.id,
          amountCents: cents,
          currency: "NZD",
        }),
      );
      actAs(to!);
      expectOk(await confirmPayment({ householdId, paymentId }));
    };
    const state = async () => {
      const e = await prisma.expense.findUniqueOrThrow({
        where: { id: created.expenseId },
      });
      const split = await prisma.expenseSplit.findFirstOrThrow({
        where: { expenseId: created.expenseId, userId: cal!.id },
      });
      return { status: e.status, settled: split.settledAt !== null };
    };

    // Cal pays Ann more than Ann's 6000 portion: only 6000 is applied to the share.
    await calPays(ann, 7000);
    expect(await state()).toEqual({ status: "PARTIALLY_PAID", settled: false });
    const toAnn = await prisma.paymentAllocation.aggregate({
      where: { payment: { toUserId: ann!.id } },
      _sum: { amountCents: true },
    });
    expect(Number(toAnn._sum.amountCents)).toBe(6000);

    // Paying Bob his 4000 portion completes the share.
    await calPays(bob, 4000);
    expect(await state()).toEqual({ status: "PAID", settled: true });
  });
});
