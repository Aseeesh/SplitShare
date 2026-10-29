import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createGroup, signInAsPerson, type FixtureGroup } from "./support/fixtures";
import { query } from "./support/helpers";

async function track(page: Page, g: FixtureGroup, name: string): Promise<string> {
  await page.goto(`/households/${g.id}/members`);
  await page.getByRole("button", { name: "Track someone" }).click();
  await page.getByPlaceholder("Name").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  const r = await query<{ id: string }>(
    `SELECT u.id FROM users u JOIN household_members m ON m.user_id=u.id
      WHERE m.household_id=$1 AND u.name=$2`,
    [g.id, name],
  );
  return r[0]!.id;
}

test.describe("§8a placeholder members", () => {
  test("admin tracks someone: placeholder row, manager, MEMBER role, audit, no role picker", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const id = await track(page, g, "Pat");

    const u = await query<{
      is_placeholder: boolean;
      managed_by_user_id: string;
      email: string;
      email_verified: string | null;
    }>(
      `SELECT is_placeholder, managed_by_user_id, email, email_verified FROM users WHERE id=$1`,
      [id],
    );
    expect(u[0]!.is_placeholder).toBe(true);
    expect(u[0]!.managed_by_user_id).toBe(g.people.Ann!.id);
    expect(u[0]!.email).toMatch(/@splithome\.invalid$/);
    expect(u[0]!.email_verified).toBeNull();
    const m = await query<{ role: string }>(
      `SELECT role FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, id],
    );
    expect(m[0]!.role).toBe("MEMBER");
    expect(
      (
        await query(
          `SELECT 1 FROM audit_logs WHERE household_id=$1 AND entity_id=$2 AND action='MEMBER_INVITED'`,
          [g.id, id],
        )
      ).length,
    ).toBe(1);

    const row = page.locator("li").filter({ hasText: "Pat" }).first();
    await expect(row.getByText("(tracked)")).toBeVisible();
    await expect(row.getByText("No account")).toBeVisible();
    // No role picker: a placeholder is always MEMBER.
    await expect(row.locator("select")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  });

  test("duplicate names are refused; MEMBER and VIEWER cannot track anyone", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    await signInAsPerson(page, g.people.Ann!);
    await track(page, g, "Pat");
    await page.getByPlaceholder("Name").fill("Pat");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "already called Pat" }),
    ).toBeVisible();
    await page.getByPlaceholder("Name").fill("Bob");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "already called Bob" }),
    ).toBeVisible();

    for (const who of ["Bob", "Eve"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(`/households/${g.id}/members`);
      await expect(
        page.getByRole("heading", { name: "Members", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Track someone" })).toHaveCount(0);
    }
  });

  test("a tracked member's split is written ACCEPTED; a real member's starts PENDING", async ({
    page,
  }) => {
    const g = await createGroup(
      { Ann: "ADMIN", Bob: "MEMBER" },
      { requireAcceptance: true },
    );
    await signInAsPerson(page, g.people.Ann!);
    const pat = await track(page, g, "Pat");

    const description = `E2E placeholder ${Date.now()}`;
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByLabel("Pat")).toBeChecked();
    await page.getByPlaceholder("Groceries").fill(description);
    await page.getByPlaceholder("59.41").fill("30.01");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.waitForURL(new RegExp(`/households/${g.id}$`));

    const splits = await query<{
      user_id: string;
      amount_cents: string;
      acceptance: string;
    }>(
      `SELECT s.user_id, s.amount_cents, s.acceptance FROM expense_splits s
         JOIN expenses e ON e.id=s.expense_id WHERE e.household_id=$1 AND e.description=$2`,
      [g.id, description],
    );
    expect(splits).toHaveLength(3);
    expect(splits.reduce((n, r) => n + Number(r.amount_cents), 0)).toBe(3001);
    const by = Object.fromEntries(splits.map((s) => [s.user_id, s.acceptance]));
    expect(by[pat]).toBe("ACCEPTED"); // nobody to accept for them
    expect(by[g.people.Ann!.id]).toBe("ACCEPTED"); // payer/creator
    expect(by[g.people.Bob!.id]).toBe("PENDING"); // real account still accepts (§8)
  });

  test("manager confirms a payment to the placeholder; a non-manager admin cannot see it", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Cal: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const pat = await track(page, g, "Pat");

    const payId = randomUUID();
    await query(
      `INSERT INTO payments (id, household_id, from_user_id, to_user_id, amount_cents, currency, method, note)
       VALUES ($1,$2,$3,$4, 500, 'NZD', 'OTHER', 'for Pat')`,
      [payId, g.id, g.people.Bob!.id, pat],
    );

    // Cal is an admin but not Pat's manager; Bob is the payer. Neither is asked to confirm.
    for (const who of ["Cal", "Bob"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(`/households/${g.id}/payments`);
      await expect(page.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
      await expect(page.getByText("Nothing to confirm")).toBeVisible();
      await expect(page.getByRole("button", { name: "Yes, it arrived" })).toHaveCount(0);
    }

    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/payments`);
    await expect(page.getByText("says they paid Pat")).toBeVisible();
    await page.getByRole("button", { name: "Yes, it arrived" }).click();
    await expect(page.getByText("Nothing to confirm")).toBeVisible();

    const c = await query<{ confirmed_by_user_id: string }>(
      `SELECT confirmed_by_user_id FROM payment_confirmations WHERE payment_id=$1`,
      [payId],
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.confirmed_by_user_id).toBe(g.people.Ann!.id); // recorded as the manager
  });

  test("removing a placeholder keeps the row and ends their membership", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    await signInAsPerson(page, g.people.Ann!);
    const pat = await track(page, g, "Pat");
    const row = page.locator("li").filter({ hasText: "Pat" }).first();
    await row.getByRole("button", { name: "Remove", exact: true }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("1 member", { exact: true })).toBeVisible();
    const m = await query<{ removed_at: string | null }>(
      `SELECT removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, pat],
    );
    expect(m[0]!.removed_at).not.toBeNull();
    expect((await query(`SELECT 1 FROM users WHERE id=$1`, [pat])).length).toBe(1);
  });
});

test.describe("§8a placeholders can never authenticate (database guarantees)", () => {
  async function placeholder() {
    const g = await createGroup({ Ann: "ADMIN" });
    const id = randomUUID();
    await query(
      `INSERT INTO users (id, name, email, is_placeholder, managed_by_user_id, updated_at)
       VALUES ($1,'Ghost',$2,true,$3, now())`,
      [id, `placeholder.${id}@splithome.invalid`, g.people.Ann!.id],
    );
    return { g, id };
  }

  test("sessions and accounts are rejected by trigger", async () => {
    const { id } = await placeholder();
    await expect(
      query(
        `INSERT INTO sessions (id, session_token, user_id, expires) VALUES ($1,$2,$3, now() + interval '1 day')`,
        [randomUUID(), `ghost-${id}`, id],
      ),
    ).rejects.toThrow(/placeholder/);
    await expect(
      query(
        `INSERT INTO accounts (id, user_id, type, provider, provider_account_id) VALUES ($1,$2,'oauth','google',$3)`,
        [randomUUID(), id, `g-${id}`],
      ),
    ).rejects.toThrow(/placeholder/);
  });

  test("a placeholder must have a manager and a real account must not", async () => {
    const g = await createGroup({ Ann: "ADMIN" });
    await expect(
      query(
        `INSERT INTO users (id, email, is_placeholder, updated_at) VALUES ($1,$2,true, now())`,
        [randomUUID(), `orphan.${randomUUID()}@splithome.invalid`],
      ),
    ).rejects.toThrow(/users_placeholder_has_manager/);
    await expect(
      query(`UPDATE users SET managed_by_user_id=$1 WHERE id=$1`, [g.people.Ann!.id]),
    ).rejects.toThrow(/users_placeholder_has_manager/);
  });
});
