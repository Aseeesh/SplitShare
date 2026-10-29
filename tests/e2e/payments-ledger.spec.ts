import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createGroup,
  signInAsPerson,
  type FixtureGroup,
  type FixturePerson,
} from "./support/fixtures";
import { query } from "./support/helpers";

/**
 * §9 payments, §12 balances, §25 pairwise ledger and offsets.
 * Expenses are seeded straight into the database (their creation is covered by
 * the expenses-* specs); everything about payments goes through the UI.
 */

type Share = [FixturePerson, number];

/** An ACCEPTED expense paid by `payer`, split as given. Returns expense id. */
async function seedExpense(
  group: FixtureGroup,
  payer: FixturePerson,
  description: string,
  shares: Share[],
): Promise<string> {
  const total = shares.reduce((n, [, c]) => n + c, 0);
  const id = randomUUID();
  // One transaction so the deferred sum triggers see a consistent set.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO expenses (id, household_id, paid_by_user_id, created_by_user_id,
         description, amount_cents, currency, date, split_method, status, updated_at)
       VALUES ($1,$2,$3,$3,$4,$5,'NZD', current_date - 1,'EXACT','ACCEPTED', now())`,
      [id, group.id, payer.id, `${description} ${Date.now()}`, total],
    );
    await client.query(
      `INSERT INTO expense_funders (id, expense_id, user_id, amount_cents) VALUES ($1,$2,$3,$4)`,
      [randomUUID(), id, payer.id, total],
    );
    for (const [p, cents] of shares) {
      await client.query(
        // The funder's own share is settled at creation, as create-core.ts does.
        `INSERT INTO expense_splits (id, expense_id, user_id, amount_cents, acceptance, accepted_at, settled_at)
         VALUES ($1,$2,$3,$4,'ACCEPTED', now(), CASE WHEN $3::uuid = $5::uuid THEN now() END)`,
        [randomUUID(), id, p.id, cents, payer.id],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
  return id;
}

async function paymentsPage(page: Page, group: FixtureGroup, who: FixturePerson) {
  await signInAsPerson(page, who);
  await page.goto(`/households/${group.id}/payments`);
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toBeVisible();
}

async function record(page: Page, toName: string, amount: string) {
  await page
    .getByLabel("Paid to")
    .selectOption({ label: new RegExp(`^${toName}`) as never })
    .catch(async () => {
      const value = await page
        .locator("#pay-to option", { hasText: toName })
        .first()
        .getAttribute("value");
      await page.getByLabel("Paid to").selectOption(value!);
    });
  await page.locator("#pay-amount").fill(amount);
  await page.getByRole("button", { name: "Record payment" }).click();
}

const payments = (groupId: string) =>
  query<{
    id: string;
    from_user_id: string;
    to_user_id: string;
    amount_cents: string;
    status: string;
    method: string;
  }>(
    `SELECT id, from_user_id, to_user_id, amount_cents, status, method
       FROM payment_states WHERE household_id=$1 ORDER BY paid_at, id`,
    [groupId],
  );

const positions = async (groupId: string) => {
  const rows = await query<{
    user_id: string;
    settled_net_cents: string;
    expense_net_cents: string;
  }>(
    `SELECT user_id, settled_net_cents, expense_net_cents FROM household_net_positions WHERE household_id=$1`,
    [groupId],
  );
  return new Map(rows.map((r) => [r.user_id, Number(r.settled_net_cents)]));
};

const expenseStatus = async (id: string) =>
  (await query<{ status: string }>(`SELECT status FROM expenses WHERE id=$1`, [id]))[0]!
    .status;

async function sumIsZero(groupId: string) {
  const [r] = await query<{ s: string }>(
    `SELECT COALESCE(SUM(settled_net_cents),0) s FROM household_net_positions WHERE household_id=$1`,
    [groupId],
  );
  expect(Number(r!.s)).toBe(0);
}

test.describe("§9 payments: record, confirm, who may act", () => {
  test("Bob records -> PENDING; only Ann confirms; split paid, expense PAID, audit rows", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({
      Ann: "ADMIN",
      Bob: "MEMBER",
      Cal: "MEMBER",
      Eve: "VIEWER",
    });
    const { Ann, Bob, Cal, Eve } = g.people as Record<string, FixturePerson>;
    const exp = await seedExpense(g, Ann!, "Groceries", [
      [Ann!, 4500],
      [Bob!, 4500],
    ]);

    await paymentsPage(page, g, Bob!);
    await record(page, "Ann", "45.00");
    await expect.poll(async () => (await payments(g.id)).length).toBe(1);

    let [p] = await payments(g.id);
    expect(p).toMatchObject({
      from_user_id: Bob!.id,
      to_user_id: Ann!.id,
      status: "PENDING_CONFIRMATION",
    });
    expect(Number(p!.amount_cents)).toBe(4500);
    // Only CONFIRMED counts: nothing moved yet.
    let pos = await positions(g.id);
    expect(pos.get(Ann!.id)).toBe(4500);
    expect(pos.get(Bob!.id)).toBe(-4500);
    expect(await expenseStatus(exp)).toBe("ACCEPTED");
    // History shows it as pending for Bob; the payer has nothing to confirm.
    await expect(page.getByText("Nothing to confirm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, it arrived" })).toHaveCount(0);

    // Cal (bystander member) and Eve (viewer) cannot confirm.
    await paymentsPage(page, g, Cal!);
    await expect(page.getByText("Nothing to confirm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, it arrived" })).toHaveCount(0);
    await paymentsPage(page, g, Eve!);
    await expect(page.getByRole("button", { name: "Yes, it arrived" })).toHaveCount(0);
    await expect(page.getByText("Record a payment")).toHaveCount(0);
    expect((await payments(g.id))[0]!.status).toBe("PENDING_CONFIRMATION");

    // Ann (recipient) confirms.
    await paymentsPage(page, g, Ann!);
    await expect(page.getByText("Bob says they paid")).toBeVisible();
    await page.getByRole("button", { name: "Yes, it arrived" }).click();
    await expect.poll(async () => (await payments(g.id))[0]!.status).toBe("CONFIRMED");

    p = (await payments(g.id))[0];
    expect(p!.status).toBe("CONFIRMED");
    expect(await expenseStatus(exp)).toBe("PAID");
    const [split] = await query<{ settled_at: Date | null }>(
      `SELECT settled_at FROM expense_splits WHERE expense_id=$1 AND user_id=$2`,
      [exp, Bob!.id],
    );
    expect(split!.settled_at).not.toBeNull();
    const alloc = await query<{ amount_cents: string }>(
      `SELECT amount_cents FROM payment_allocations WHERE payment_id=$1`,
      [p!.id],
    );
    expect(alloc.map((a) => Number(a.amount_cents))).toEqual([4500]);
    pos = await positions(g.id);
    expect(pos.get(Ann!.id)).toBe(0);
    expect(pos.get(Bob!.id)).toBe(0);
    const audit = await query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE household_id=$1`,
      [g.id],
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["PAYMENT_CREATED", "PAYMENT_CONFIRMED"]),
    );
    // Cannot be confirmed twice: the card is gone, only one confirmation row.
    const confs = await query(`SELECT 1 FROM payment_confirmations WHERE payment_id=$1`, [
      p!.id,
    ]);
    expect(confs).toHaveLength(1);
  });

  test("outsider is refused the payments page and nothing is recorded", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const other = await createGroup({ Zed: "ADMIN" });
    await signInAsPerson(page, other.people.Zed!);
    await page.goto(`/households/${g.id}/payments`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
    expect(await payments(g.id)).toHaveLength(0);
  });

  test("partial payments move PARTIALLY_PAID then PAID, allocations sum to the share", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const { Ann, Bob } = g.people as Record<string, FixturePerson>;
    const exp = await seedExpense(g, Ann!, "Rent", [
      [Ann!, 4500],
      [Bob!, 4500],
    ]);

    for (const [amount, expectedStatus, nth] of [
      ["20.00", "PARTIALLY_PAID", 1],
      ["25.00", "PAID", 2],
    ] as const) {
      await paymentsPage(page, g, Bob!);
      await record(page, "Ann", amount);
      await expect.poll(async () => (await payments(g.id)).length).toBe(nth);
      await paymentsPage(page, g, Ann!);
      await page.getByRole("button", { name: "Yes, it arrived" }).first().click();
      await expect.poll(() => expenseStatus(exp)).toBe(expectedStatus);
      if (nth === 1) {
        const [s] = await query<{ settled_at: Date | null }>(
          `SELECT settled_at FROM expense_splits WHERE expense_id=$1 AND user_id=$2`,
          [exp, Bob!.id],
        );
        expect(s!.settled_at).toBeNull();
        expect((await positions(g.id)).get(Bob!.id)).toBe(-2500);
      }
    }
    const [{ total }] = (await query<{ total: string }>(
      `SELECT SUM(a.amount_cents) total FROM payment_allocations a
         JOIN payments p ON p.id=a.payment_id WHERE p.household_id=$1`,
      [g.id],
    )) as [{ total: string }];
    expect(Number(total)).toBe(4500);
    await sumIsZero(g.id);
  });

  test("overpayment: expense still PAID, excess stays a credit, books still sum to 0", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const { Ann, Bob } = g.people as Record<string, FixturePerson>;
    const exp = await seedExpense(g, Ann!, "Dinner", [
      [Ann!, 4500],
      [Bob!, 4500],
    ]);

    await paymentsPage(page, g, Bob!);
    await record(page, "Ann", "60.00");
    await expect.poll(async () => (await payments(g.id)).length).toBe(1);
    await paymentsPage(page, g, Ann!);
    await page.getByRole("button", { name: "Yes, it arrived" }).click();
    await expect.poll(() => expenseStatus(exp)).toBe("PAID");

    const [{ total }] = (await query<{ total: string }>(
      `SELECT COALESCE(SUM(a.amount_cents),0) total FROM payment_allocations a
         JOIN payments p ON p.id=a.payment_id WHERE p.household_id=$1`,
      [g.id],
    )) as [{ total: string }];
    expect(Number(total)).toBe(4500); // never more than owed
    const pos = await positions(g.id);
    expect(pos.get(Bob!.id)).toBe(1500); // Bob is now owed the excess
    expect(pos.get(Ann!.id)).toBe(-1500);
    await sumIsZero(g.id);
  });

  test("payments are immutable: UPDATE and DELETE are rejected by the database", async () => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const { Ann, Bob } = g.people as Record<string, FixturePerson>;
    const id = randomUUID();
    await query(
      `INSERT INTO payments (id, household_id, from_user_id, to_user_id, amount_cents, currency, method)
       VALUES ($1,$2,$3,$4,1000,'NZD','CASH')`,
      [id, g.id, Bob!.id, Ann!.id],
    );
    await expect(
      query(`UPDATE payments SET amount_cents = 1 WHERE id=$1`, [id]),
    ).rejects.toThrow();
    await expect(query(`DELETE FROM payments WHERE id=$1`, [id])).rejects.toThrow();
    // A cancellation is a NEW negative row pointing back; the original stays.
    const rev = randomUUID();
    await query(
      `INSERT INTO payments (id, household_id, from_user_id, to_user_id, amount_cents, currency, method, reverses_payment_id)
       VALUES ($1,$2,$3,$4,-1000,'NZD','CASH',$5)`,
      [rev, g.id, Bob!.id, Ann!.id, id],
    );
    const rows = await payments(g.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === id)!.status).toBe("REVERSED");
    // A second reversal of the same payment is impossible.
    await expect(
      query(
        `INSERT INTO payments (id, household_id, from_user_id, to_user_id, amount_cents, currency, method, reverses_payment_id)
         VALUES ($1,$2,$3,$4,-1000,'NZD','CASH',$5)`,
        [randomUUID(), g.id, Bob!.id, Ann!.id, id],
      ),
    ).rejects.toThrow();
  });

  test("viewer sees no way to record or confirm; archived group blocks payments", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    const { Bob, Eve } = g.people as Record<string, FixturePerson>;
    await paymentsPage(page, g, Eve!);
    await expect(page.getByText("Record a payment")).toHaveCount(0);
    await expect(page.getByText("Waiting on you")).toHaveCount(0);
    await paymentsPage(page, g, Bob!);
    await expect(page.getByRole("heading", { name: "Record a payment" })).toBeVisible();

    await query(
      `UPDATE households SET status='ARCHIVED', archived_at=now() WHERE id=$1`,
      [g.id],
    );
    await signInAsPerson(page, Bob!);
    await page.goto(`/households/${g.id}/payments`);
    // §24: non-ACTIVE households are hidden from members, so no payment form exists.
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    expect(await payments(g.id)).toHaveLength(0);
  });
});

test.describe("§25 pairwise ledger: offsets (cancel-out)", () => {
  async function mutualDebts() {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Cal: "MEMBER" });
    const { Ann, Bob, Cal } = g.people as Record<string, FixturePerson>;
    // Bob owes Ann 3000; Ann owes Bob 2000 => 2000 cancellable.
    const e1 = await seedExpense(g, Ann!, "Ann paid", [
      [Ann!, 1000],
      [Bob!, 3000],
    ]);
    const e2 = await seedExpense(g, Bob!, "Bob paid", [
      [Bob!, 1000],
      [Ann!, 2000],
    ]);
    return { g, Ann: Ann!, Bob: Bob!, Cal: Cal!, e1, e2 };
  }

  test("Ann proposes, Bob (counterparty) accepts both legs; Cal sees nothing", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const { g, Ann, Bob, Cal, e1, e2 } = await mutualDebts();
    const before = await positions(g.id);

    await paymentsPage(page, g, Ann);
    await page.getByRole("button", { name: /Cancel out/ }).click();
    await expect.poll(async () => (await payments(g.id)).length).toBe(2);
    const legs = await payments(g.id);
    expect(
      legs.every((l) => l.method === "OFFSET" && l.status === "PENDING_CONFIRMATION"),
    ).toBe(true);
    expect(legs.map((l) => Number(l.amount_cents))).toEqual([2000, 2000]);
    await expect(page.getByText("Waiting for them to accept")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0); // proposer can't accept
    expect(await positions(g.id)).toEqual(before);

    await paymentsPage(page, g, Cal);
    await expect(page.getByText(/wants to cancel/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);

    await paymentsPage(page, g, Bob);
    await expect(page.getByText(/Ann wants to cancel/)).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).click();
    await expect
      .poll(async () => (await payments(g.id)).every((l) => l.status === "CONFIRMED"))
      .toBe(true);

    // Net positions unchanged by the offset itself (legs cancel), and still zero-sum.
    expect(await positions(g.id)).toEqual(before);
    await sumIsZero(g.id);
    // Allocations settled 2000 against each side's oldest shares.
    const alloc = await query<{ amount_cents: string }>(
      `SELECT a.amount_cents FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE p.household_id=$1`,
      [g.id],
    );
    expect(alloc.reduce((n, a) => n + Number(a.amount_cents), 0)).toBe(4000);
    expect(await expenseStatus(e2)).toBe("PAID"); // Ann's 2000 share fully cancelled
    expect(await expenseStatus(e1)).toBe("PARTIALLY_PAID"); // Bob's 3000 share 2000 covered
    const audit = await query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE household_id=$1 AND action='PAYMENT_CONFIRMED'`,
      [g.id],
    );
    expect(audit).toHaveLength(2);
  });

  test("proposer withdraws: reversal rows, nothing can be accepted afterwards", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const { g, Ann, Bob } = await mutualDebts();
    await paymentsPage(page, g, Ann);
    await page.getByRole("button", { name: /Cancel out/ }).click();
    await expect.poll(async () => (await payments(g.id)).length).toBe(2);
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect.poll(async () => (await payments(g.id)).length).toBe(4);

    const rows = await query<{
      amount_cents: string;
      reverses_payment_id: string | null;
    }>(`SELECT amount_cents, reverses_payment_id FROM payments WHERE household_id=$1`, [
      g.id,
    ]);
    expect(
      rows.filter((r) => r.reverses_payment_id && Number(r.amount_cents) === -2000),
    ).toHaveLength(2);
    expect(
      rows.filter((r) => !r.reverses_payment_id && Number(r.amount_cents) === 2000),
    ).toHaveLength(2);

    await paymentsPage(page, g, Bob);
    await expect(page.getByText(/wants to cancel/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);
    await sumIsZero(g.id);
  });

  test("a proposal older than 7 days cannot be accepted and does not block a new one", async ({
    page,
  }) => {
    const { g, Ann, Bob } = await mutualDebts();
    const ref = `offset:${randomUUID()}:${Ann.id}`;
    for (const [from, to] of [
      [Ann.id, Bob.id],
      [Bob.id, Ann.id],
    ]) {
      await query(
        `INSERT INTO payments (id, household_id, from_user_id, to_user_id, amount_cents, currency,
           method, reference, paid_at) VALUES ($1,$2,$3,$4,2000,'NZD','OFFSET',$5, now() - interval '8 days')`,
        [randomUUID(), g.id, from, to, ref],
      );
    }
    await paymentsPage(page, g, Bob);
    await expect(page.getByText(/Ann wants to cancel/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(0);

    await paymentsPage(page, g, Ann);
    await expect(page.getByText("Waiting for them to accept")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cancel out/ })).toBeVisible();
    expect((await payments(g.id)).every((l) => l.status === "PENDING_CONFIRMATION")).toBe(
      true,
    );
  });
});

test.describe("§12 balances: worked example, zero-sum, reversal exclusion", () => {
  test("Ann/Bob/Cal 9000+6000 => +4000/+1000/-5000; minimal transfers; reversal exclusion", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Cal: "MEMBER" });
    const { Ann, Bob, Cal } = g.people as Record<string, FixturePerson>;
    const e1 = await seedExpense(g, Ann!, "Nine", [
      [Ann!, 3000],
      [Bob!, 3000],
      [Cal!, 3000],
    ]);
    await seedExpense(g, Bob!, "Six", [
      [Ann!, 2000],
      [Bob!, 2000],
      [Cal!, 2000],
    ]);

    const nets = async () =>
      new Map(
        (
          await query<{
            user_id: string;
            net_cents: string;
            total_paid_cents: string;
            total_owed_cents: string;
          }>(
            `SELECT user_id, net_cents, total_paid_cents, total_owed_cents FROM household_balances WHERE household_id=$1`,
            [g.id],
          )
        ).map((r) => [r.user_id, r]),
      );
    let n = await nets();
    expect(Number(n.get(Ann!.id)!.total_paid_cents)).toBe(9000);
    expect(Number(n.get(Ann!.id)!.total_owed_cents)).toBe(5000);
    expect(Number(n.get(Ann!.id)!.net_cents)).toBe(4000);
    expect(Number(n.get(Bob!.id)!.net_cents)).toBe(1000);
    expect(Number(n.get(Cal!.id)!.net_cents)).toBe(-5000);
    expect([...n.values()].reduce((s, r) => s + Number(r.net_cents), 0)).toBe(0);

    // UI: Cal owes 50.00 and the plan is Cal -> Ann 40.00, Cal -> Bob 10.00.
    await signInAsPerson(page, Cal!);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText("You owe", { exact: true })).toBeVisible();
    await expect(page.getByText("$50.00").first()).toBeVisible();
    await expect(page.getByText("Settle up")).toBeVisible();
    const plan = page.locator("li", { hasText: /\$40\.00/ }).first();
    await expect(plan).toContainText("Ann");
    await expect(
      page
        .locator("li", { hasText: /\$10\.00/ })
        .filter({ hasText: "Bob" })
        .first(),
    ).toBeVisible();
    await signInAsPerson(page, Ann!);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText("You are owed", { exact: true })).toBeVisible();
    await expect(page.getByText("$40.00").first()).toBeVisible();

    // Reverse the 9000 expense via the UI (as Ann, its creator/admin).
    await page.goto(`/households/${g.id}/expenses/${e1}`);
    await page
      .getByRole("button", { name: /^Delete/ })
      .first()
      .click();
    await page.locator("#reverse-reason").fill("Entered twice");
    await page.getByRole("button", { name: "Delete it" }).click();
    await expect.poll(() => expenseStatus(e1)).toBe("REVERSED");

    const rev = await query<{ amount_cents: string; status: string }>(
      `SELECT amount_cents, status FROM expenses WHERE reverses_expense_id=$1`,
      [e1],
    );
    expect(rev).toHaveLength(1);
    expect(Number(rev[0]!.amount_cents)).toBe(-9000);

    // Only the 6000 expense counts now; asserted per person, not just the sum
    // (double-counting the cancellation keeps the sum at 0 but breaks each net).
    n = await nets();
    expect(Number(n.get(Ann!.id)!.net_cents)).toBe(-2000);
    expect(Number(n.get(Bob!.id)!.net_cents)).toBe(4000);
    expect(Number(n.get(Cal!.id)!.net_cents)).toBe(-2000);
    expect(Number(n.get(Ann!.id)!.total_paid_cents)).toBe(0);
    expect([...n.values()].reduce((s, r) => s + Number(r.net_cents), 0)).toBe(0);
    await sumIsZero(g.id);
  });
});
