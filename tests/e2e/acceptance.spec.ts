import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

import { SESSION_TOKENS } from "./tokens";

/**
 * §40 acceptance scenario, as a person would click through it on a phone.
 *
 * Steps 1-2 (sign in with Google, invite and accept) are covered elsewhere: the
 * seed signs people in with a database session, and the invite link has its own
 * tests. Everything from creating the expense onwards is driven through the UI.
 */

async function signInAs(page: Page, who: keyof typeof SESSION_TOKENS) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: SESSION_TOKENS[who],
      url: "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

// A 1x1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

test("create, accept, pay, confirm, balance to zero, lock", async ({
  page,
}, testInfo) => {
  // It mutates the database, so it runs once, on the larger phone only.
  test.skip(testInfo.project.name !== "phone", "mutates data; run once");
  const [{ id: householdId }] = await query<{ id: string }>(
    "SELECT id FROM households WHERE name = 'Acceptance flat'",
  );
  const home = `/households/${householdId}`;

  // 3. Ann creates "Groceries", 90.00, equal between Ann and Bob, with a JPEG receipt.
  await signInAs(page, "Ann");
  await page.goto(`${home}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill("Groceries");
  await page.getByPlaceholder("59.41").fill("90.00");
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer: JPEG,
  });
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL(new RegExp(`${home}$`));
  await expect(page.getByText("Groceries").first()).toBeVisible();

  const [expense] = await query<{ id: string; status: string }>(
    "SELECT id, status FROM expenses WHERE household_id = $1 AND description = 'Groceries'",
    [householdId],
  );
  expect(["PENDING_ACCEPTANCE", "PARTIALLY_ACCEPTED"]).toContain(expense!.status);
  const splits = await query<{ name: string; amount_cents: string }>(
    "SELECT u.name, s.amount_cents FROM expense_splits s JOIN users u ON u.id = s.user_id WHERE s.expense_id = $1",
    [expense!.id],
  );
  expect(splits.find((s) => s.name === "Bob")?.amount_cents).toBe("4500");
  const [{ count: receipts }] = await query<{ count: string }>(
    "SELECT count(*) FROM expenses WHERE id = $1 AND receipt_file_id IS NOT NULL",
    [expense!.id],
  );
  expect(receipts).toBe("1");

  // 4. Bob sees "Awaiting your action" and accepts.
  await signInAs(page, "Bob");
  await page.goto(home);
  await expect(page.getByText("Awaiting your action")).toBeVisible();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await query<{ status: string }>("SELECT status FROM expenses WHERE id = $1", [
            expense!.id,
          ])
        )[0]!.status,
    )
    .toBe("ACCEPTED");

  // 5. Bob records a payment of 45.00 to Ann: PENDING_CONFIRMATION.
  await page.goto(`${home}/payments`);
  // Ann is the only other member, so she is already selected, with what Bob owes.
  await expect(page.getByLabel("Paid to")).toContainText("Ann");
  await page.getByLabel("Amount (NZD)").fill("45.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect
    .poll(
      async () =>
        (
          await query<{ status: string }>(
            "SELECT status FROM payment_states WHERE household_id = $1",
            [householdId],
          )
        )[0]?.status,
    )
    .toBe("PENDING_CONFIRMATION");

  // 6. Ann confirms it: CONFIRMED, Bob's split paid, expense PAID.
  await signInAs(page, "Ann");
  await page.goto(`${home}/payments`);
  await page.getByRole("button", { name: "Yes, it arrived" }).click();
  await expect
    .poll(
      async () =>
        (
          await query<{ status: string }>("SELECT status FROM expenses WHERE id = $1", [
            expense!.id,
          ])
        )[0]!.status,
    )
    .toBe("PAID");

  // 7. Net zero for both, and the audit trail has all four events.
  const nets = await query<{ settled_net_cents: string }>(
    "SELECT settled_net_cents FROM household_net_positions WHERE household_id = $1",
    [householdId],
  );
  expect(nets.map((n) => n.settled_net_cents)).toEqual(["0", "0"]);
  const actions = (
    await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE household_id = $1",
      [householdId],
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
  await page.goto(home);
  await expect(page.getByText("You are settled up")).toBeVisible();

  // 8. Ann locks the expense; nothing further can be done to it.
  await page.goto(`${home}/expenses/${expense!.id}`);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.getByRole("button", { name: "Lock permanently" }).click();
  await expect
    .poll(
      async () =>
        (
          await query<{ status: string }>("SELECT status FROM expenses WHERE id = $1", [
            expense!.id,
          ])
        )[0]!.status,
    )
    .toBe("LOCKED");
  await page.reload();
  await expect(page.getByText("This expense is locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
