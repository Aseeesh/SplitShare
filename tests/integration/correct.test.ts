import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { correctExpense } from "@/actions/expenses/correct";
import { createExpense } from "@/actions/expenses/create";
import { respondToSplit } from "@/actions/expenses/respond";
import { createHousehold } from "@/actions/households/create";
import type { ActionResult } from "@/lib/actions/result";

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

describeDb("correcting an expense", () => {
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

    const base = {
      householdId,
      paidByUserId: ann!.id,
      categoryId: null,
      description: "Power",
      currency: "NZD",
      date: new Date("2026-10-07T00:00:00.000Z"),
      splitMethod: "PERCENTAGE" as const,
      participants: [
        { userId: ann!.id, percentBps: 7000 },
        { userId: bob!.id, percentBps: 3000 },
      ],
    };
    const original = expectOk(await createExpense({ ...base, amountCents: 10000 }));
    actAs(bob!);
    expectOk(
      await respondToSplit({
        householdId,
        expenseId: original.expenseId,
        decision: "ACCEPTED",
      }),
    );
    actAs(ann!);
    return { prisma, ann: ann!, bob: bob!, householdId, base, original };
  }

  it("replaces the original in one step, keeping the percentage method", async () => {
    const { prisma, ann, bob, householdId, base, original } = await setup();
    expect((await nets(householdId)).get(ann.id)).toBe(3000);

    const corrected = expectOk(
      await correctExpense({
        ...base,
        amountCents: 20000,
        correctsExpenseId: original.expenseId,
      }),
    );

    const before = await prisma.expense.findUniqueOrThrow({
      where: { id: original.expenseId },
    });
    expect(before.status).toBe("REVERSED");

    const replacement = await prisma.expense.findUniqueOrThrow({
      where: { id: corrected.expenseId },
      include: { splits: true },
    });
    expect(replacement.splitMethod).toBe("PERCENTAGE");
    expect(Number(replacement.amountCents)).toBe(20000);
    expect(replacement.splits.map((s) => s.percentBps).sort()).toEqual([3000, 7000]);

    // The books reflect only the corrected figures: Bob owes 30% of 20000.
    // (His share needs accepting again, so until then nothing is owed.)
    actAs(bob);
    expectOk(
      await respondToSplit({
        householdId,
        expenseId: corrected.expenseId,
        decision: "ACCEPTED",
      }),
    );
    const after = await nets(householdId);
    expect(after.get(ann.id)).toBe(6000);
    expect(after.get(bob.id)).toBe(-6000);

    // One audit row ties the reversal to its replacement.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "EXPENSE_REVERSED", entityId: original.expenseId },
    });
    expect(audit.afterJson).toMatchObject({
      reason: "Corrected",
      replacementExpenseId: corrected.expenseId,
    });
  });

  it("refuses to correct the same expense twice, and creates nothing the second time", async () => {
    const { prisma, householdId, base, original } = await setup();
    expectOk(
      await correctExpense({
        ...base,
        amountCents: 12000,
        correctsExpenseId: original.expenseId,
      }),
    );
    const count = await prisma.expense.count({ where: { householdId } });

    const again = await correctExpense({
      ...base,
      amountCents: 15000,
      correctsExpenseId: original.expenseId,
    });
    expect(again.ok).toBe(false);
    expect(await prisma.expense.count({ where: { householdId } })).toBe(count);
  });

  it("leaves everything untouched when the replacement is invalid", async () => {
    const { prisma, householdId, base, original } = await setup();
    const count = await prisma.expense.count({ where: { householdId } });
    const bad = await correctExpense({
      ...base,
      amountCents: 12000,
      // percentages that do not total 100%
      participants: base.participants.map((p) => ({ ...p, percentBps: 1000 })),
      correctsExpenseId: original.expenseId,
    });
    expect(bad.ok).toBe(false);
    expect(await prisma.expense.count({ where: { householdId } })).toBe(count);
    expect(
      (await prisma.expense.findUniqueOrThrow({ where: { id: original.expenseId } }))
        .status,
    ).not.toBe("REVERSED");
  });
});
