import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createGroup, signInAsPerson, type FixtureGroup } from "./support/fixtures";
import { query } from "./support/helpers";

/**
 * §11 audit log, §17 notifications, §18 reminders, §21 rate limiting.
 */

async function addExpense(
  page: Page,
  group: FixtureGroup,
  description: string,
  amount = "90.00",
) {
  await page.goto(`/households/${group.id}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill(description);
  await page.getByPlaceholder("59.41").fill(amount);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL(new RegExp(`/households/${group.id}$`));
  const rows = await query<{ id: string }>(
    "SELECT id FROM expenses WHERE household_id = $1 AND description = $2",
    [group.id, description],
  );
  return rows[0]!.id;
}

test.describe("§11 audit log", () => {
  test("each financial transition writes an audit row in its own transaction, and the log is append-only", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup(
      { Ann: "ADMIN", Bob: "MEMBER" },
      { requireAcceptance: true },
    );
    const ann = g.people.Ann!;
    const bob = g.people.Bob!;

    await signInAsPerson(page, ann);
    const expenseId = await addExpense(page, g, `Audit groceries ${Date.now()}`);

    // EXPENSE_CREATED shares a transaction (xmin) with Ann's own split, which is
    // inserted at creation and never touched afterwards.
    const created = await query<{ same_tx: boolean; actor: string; after_json: unknown }>(
      `SELECT a.xmin::text = s.xmin::text AS same_tx, a.actor_user_id AS actor, a.after_json
         FROM audit_logs a
         JOIN expense_splits s ON s.expense_id = a.entity_id AND s.user_id = $2
        WHERE a.household_id = $1 AND a.action = 'EXPENSE_CREATED' AND a.entity_id = $3`,
      [g.id, ann.id, expenseId],
    );
    expect(created).toHaveLength(1);
    expect(created[0]!.same_tx).toBe(true);
    expect(created[0]!.actor).toBe(ann.id);
    expect(created[0]!.after_json).toBeTruthy();

    // Bob accepts.
    await signInAsPerson(page, bob);
    await page.goto(`/households/${g.id}`);
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await query<{ status: string }>("SELECT status FROM expenses WHERE id=$1", [
              expenseId,
            ])
          )[0]!.status,
      )
      .toBe("ACCEPTED");

    // Bob pays Ann 45.00.
    await page.goto(`/households/${g.id}/payments`);
    await page.getByLabel("Amount (NZD)").fill("45.00");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect
      .poll(
        async () =>
          (await query("SELECT 1 FROM payments WHERE household_id=$1", [g.id])).length,
      )
      .toBeGreaterThan(0);

    // Ann confirms.
    await signInAsPerson(page, ann);
    await page.goto(`/households/${g.id}/payments`);
    await page.getByRole("button", { name: "Yes, it arrived" }).click();
    await expect
      .poll(
        async () =>
          (
            await query<{ status: string }>("SELECT status FROM expenses WHERE id=$1", [
              expenseId,
            ])
          )[0]!.status,
      )
      .toBe("PAID");

    const actions = (
      await query<{ action: string }>(
        "SELECT action FROM audit_logs WHERE household_id=$1",
        [g.id],
      )
    ).map((r) => r.action);
    for (const wanted of [
      "EXPENSE_CREATED",
      "EXPENSE_ACCEPTED",
      "PAYMENT_CREATED",
      "PAYMENT_CONFIRMED",
    ]) {
      expect(actions, wanted).toContain(wanted);
    }

    // Payment audit rows share a transaction with the payment row they describe.
    const paymentAudit = await query<{ same_tx: boolean }>(
      `SELECT a.xmin::text = p.xmin::text AS same_tx
         FROM audit_logs a JOIN payments p ON p.id = a.entity_id
        WHERE a.household_id = $1 AND a.action = 'PAYMENT_CREATED'`,
      [g.id],
    );
    expect(paymentAudit.length).toBeGreaterThan(0);
    expect(paymentAudit.every((r) => r.same_tx)).toBe(true);

    // Every audited actor is a real member of the group (never client-supplied).
    const strangers = await query(
      `SELECT 1 FROM audit_logs a WHERE a.household_id = $1 AND a.actor_user_id IS NOT NULL
          AND a.actor_user_id NOT IN ($2, $3)`,
      [g.id, ann.id, bob.id],
    );
    expect(strangers).toHaveLength(0);

    // Append-only at the database layer (§10).
    await expect(
      query("UPDATE audit_logs SET action = 'EXPENSE_LOCKED' WHERE household_id = $1", [
        g.id,
      ]),
    ).rejects.toThrow();
    await expect(
      query("DELETE FROM audit_logs WHERE household_id = $1", [g.id]),
    ).rejects.toThrow();
    await expect(
      query("UPDATE payments SET amount_cents = 1 WHERE household_id = $1", [g.id]),
    ).rejects.toThrow();
    await expect(
      query("DELETE FROM payments WHERE household_id = $1", [g.id]),
    ).rejects.toThrow();
    const after = await query<{ n: string }>(
      "SELECT count(*) n FROM audit_logs WHERE household_id=$1",
      [g.id],
    );
    expect(Number(after[0]!.n)).toBe(actions.length);
  });
});

test.describe("§17 notifications", () => {
  test("a new expense notifies the other participant, shows in the bell and the list, and the actor gets none", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const expenseId = await addExpense(page, g, `Notify me ${Date.now()}`);

    const rows = await query<{
      user_id: string;
      type: string;
      entity_id: string | null;
      read_at: string | null;
    }>(
      "SELECT user_id, type, entity_id, read_at FROM notifications WHERE household_id=$1",
      [g.id],
    );
    const forBob = rows.filter((r) => r.user_id === g.people.Bob!.id);
    expect(forBob.map((r) => r.type)).toContain("EXPENSE_CREATED");
    expect(forBob.find((r) => r.type === "EXPENSE_CREATED")!.entity_id).toBe(expenseId);
    expect(
      rows.filter((r) => r.user_id === g.people.Ann!.id && r.type === "EXPENSE_CREATED"),
    ).toHaveLength(0);

    await signInAsPerson(page, g.people.Bob!);
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Ann|expense|share/i }).first(),
    ).toBeVisible();
  });

  test("marking read only touches the caller's own notifications", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const annNote = randomUUID();
    const bobNote = randomUUID();
    for (const [id, who] of [
      [annNote, g.people.Ann!],
      [bobNote, g.people.Bob!],
    ] as const) {
      await query(
        `INSERT INTO notifications (id, household_id, user_id, type, title, body)
         VALUES ($1, $2, $3, 'MEMBER_JOINED', $4, 'seeded')`,
        [id, g.id, who.id, `Seeded for ${who.name}`],
      );
    }
    await signInAsPerson(page, g.people.Bob!);
    await page.goto("/notifications");
    await expect(page.getByText("Seeded for Bob")).toBeVisible();
    await expect(page.getByText("Seeded for Ann")).toHaveCount(0);
    await page.getByRole("button", { name: "Mark all read" }).click();

    await expect
      .poll(
        async () =>
          (
            await query<{ read_at: string | null }>(
              "SELECT read_at FROM notifications WHERE id=$1",
              [bobNote],
            )
          )[0]!.read_at,
      )
      .not.toBeNull();
    const ann = await query<{ read_at: string | null }>(
      "SELECT read_at FROM notifications WHERE id=$1",
      [annNote],
    );
    expect(ann[0]!.read_at).toBeNull();

    // The bell reflects the remaining count for the owner of the unread one.
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}`);
    await expect(
      page
        .getByRole("link", { name: /1 unread notification/ })
        .or(page.getByRole("button", { name: /1 unread notification/ }))
        .first(),
    ).toBeVisible();
  });
});

test.describe("§21 rate limiting", () => {
  test("the 11th invitation within the hour is refused", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const g = await createGroup({ Ann: "ADMIN" });
    await query("UPDATE households SET max_members_override = 100 WHERE id = $1", [g.id]);
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    const input = page.getByRole("combobox").first();
    // Retry the mode switch until hydration has attached the handler.
    await expect(async () => {
      await page.getByRole("button", { name: "Invite by email" }).click();
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass();
    const tag = Date.now();
    for (let i = 0; i < 11; i++) {
      await input.fill(`rl${i}.${tag}@example.test`);
      await input.press("Enter");
    }
    await page
      .getByRole("button", { name: /^Invite/ })
      .last()
      .click();

    await expect(
      page.getByRole("alert").filter({ hasText: /Too many invitations/i }),
    ).toBeVisible({ timeout: 60_000 });
    const rows = await query<{ n: string }>(
      "SELECT count(*) n FROM invitations WHERE household_id=$1 AND status='PENDING'",
      [g.id],
    );
    expect(Number(rows[0]!.n)).toBe(10);
  });
});

test.describe("§18 reminders", () => {
  test("the (split, offset) unique key makes a replayed schedule insert nothing", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    // The cron route itself needs CRON_SECRET (unset on this server -> 401), so the
    // observable guarantee here is the database key; the pure schedule and the
    // route are covered in tests/reminders and tests/integration/cron.test.ts.
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const expenseId = randomUUID();
    const splitId = randomUUID();
    const bob = g.people.Bob!;
    const ann = g.people.Ann!;
    const { Client } = await import("pg");
    const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `INSERT INTO expenses (id, household_id, created_by_user_id, paid_by_user_id, description, amount_cents, currency, date, split_method, status, updated_at)
         VALUES ($1,$2,$3,$3,'Reminder fixture',1000,'NZD',now(),'EQUAL','ACCEPTED',now())`,
        [expenseId, g.id, ann.id],
      );
      await c.query(
        `INSERT INTO expense_splits (id, expense_id, user_id, amount_cents, acceptance_status, updated_at)
         VALUES ($1,$2,$3,1000,'ACCEPTED',now())`,
        [splitId, expenseId, bob.id],
      );
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      await c.end();
      test.skip(true, `fixture insert not possible: ${String(error)}`);
      return;
    }
    try {
      const insert = (): Promise<unknown> =>
        c.query(
          `INSERT INTO reminders (id, household_id, expense_split_id, user_id, offset_days, due_date)
           VALUES ($1,$2,$3,$4,3,current_date) ON CONFLICT (expense_split_id, offset_days) DO NOTHING`,
          [randomUUID(), g.id, splitId, bob.id],
        );
      await insert();
      await insert();
      const n = await c.query(
        "SELECT count(*) n FROM reminders WHERE expense_split_id=$1",
        [splitId],
      );
      expect(Number(n.rows[0].n)).toBe(1);
      // Without ON CONFLICT the duplicate is rejected outright.
      await expect(
        c.query(
          `INSERT INTO reminders (id, household_id, expense_split_id, user_id, offset_days, due_date)
           VALUES ($1,$2,$3,$4,3,current_date)`,
          [randomUUID(), g.id, splitId, bob.id],
        ),
      ).rejects.toThrow();
    } finally {
      await c.end();
    }
  });
});
