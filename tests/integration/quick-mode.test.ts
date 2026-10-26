import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createExpense } from "@/actions/expenses/create";
import { createHousehold } from "@/actions/households/create";
import { updateRequireAcceptance } from "@/actions/households/settings";
import type { ActionResult } from "@/lib/actions/result";

/** Quick mode (§8 amendment): households that skip the accept step. */

const db = await connectIntegrationDatabase();
const describeDb = db ? describe : describe.skip;

afterAll(async () => {
  await db?.prisma.$disconnect();
});

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  }
  return result.data;
}

async function createUser(name: string) {
  const email = `${name.toLowerCase()}@example.test`;
  const user = await db!.prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, emailVerified: new Date() },
    select: { id: true, name: true, email: true },
  });
  return { id: user.id, name: user.name!, email: user.email };
}

async function groceries(householdId: string, paidBy: string, other: string) {
  return expectOk(
    await createExpense({
      householdId,
      paidByUserId: paidBy,
      categoryId: null,
      description: "Groceries",
      amountCents: 9000,
      currency: "NZD",
      date: new Date("2026-10-07T00:00:00.000Z"),
      splitMethod: "EQUAL",
      participants: [{ userId: paidBy }, { userId: other }],
    }),
  );
}

describeDb("quick mode", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  it("counts every share immediately when acceptance is not required", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    actAs(ann);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD", requireAcceptance: false }),
    );
    await db!.prisma.householdMember.create({
      data: { householdId, userId: bob.id, role: "MEMBER" },
    });

    const { expenseId, status } = await groceries(householdId, ann.id, bob.id);
    expect(status).toBe("ACCEPTED");

    const splits = await db!.prisma.expenseSplit.findMany({ where: { expenseId } });
    expect(splits.every((split) => split.acceptance === "ACCEPTED")).toBe(true);

    // The balances view only counts accepted expenses, so Bob's debt is real.
    const rows = await db!.prisma.$queryRaw<
      Array<{ user_id: string; net_cents: bigint }>
    >`
      SELECT user_id, net_cents FROM household_balances WHERE household_id = ${householdId}::uuid`;
    expect(Number(rows.find((row) => row.user_id === bob.id)?.net_cents)).toBe(-4500);
  });

  it("still requires acceptance by default, and can be switched by an admin", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    actAs(ann);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    await db!.prisma.householdMember.create({
      data: { householdId, userId: bob.id, role: "MEMBER" },
    });

    expect((await groceries(householdId, ann.id, bob.id)).status).toBe(
      "PARTIALLY_ACCEPTED",
    );

    expectOk(await updateRequireAcceptance({ householdId, requireAcceptance: false }));
    expect((await groceries(householdId, ann.id, bob.id)).status).toBe("ACCEPTED");

    // A member cannot flip it.
    actAs(bob);
    const denied = await updateRequireAcceptance({
      householdId,
      requireAcceptance: true,
    });
    expect(denied.ok).toBe(false);
  });
});
