import { expect, test } from "@playwright/test";

import { createGroup, createSuperUser, signInAsPerson } from "./support/fixtures";
import { query } from "./support/helpers";

test.describe("§23 multi-org + §8b quick mode: creating a group", () => {
  test("a signed-in user creates a group, becomes ADMIN, quick mode on, chosen currency", async ({
    page,
  }) => {
    const { people } = await createGroup({ Ann: "ADMIN" });
    const name = `Trip ${Date.now()}`;
    await signInAsPerson(page, people.Ann!);
    await page.goto("/households");
    await page.getByLabel("Group name").fill(name);
    await page.getByLabel("Currency").selectOption("USD");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/households\/[0-9a-f-]{36}$/);

    const rows = await query<{
      id: string;
      currency: string;
      require_acceptance: boolean;
      status: string;
      role: string;
    }>(
      `SELECT h.id, h.currency, h.require_acceptance, h.status, m.role
         FROM households h JOIN household_members m ON m.household_id = h.id
        WHERE h.name = $1 AND m.user_id = $2`,
      [name, people.Ann!.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: "USD",
      require_acceptance: false, // §8b: new groups default to quick mode
      status: "ACTIVE",
      role: "ADMIN",
    });
    const audit = await query(
      `SELECT 1 FROM audit_logs WHERE household_id = $1 AND action = 'HOUSEHOLD_CREATED' AND actor_user_id = $2`,
      [rows[0]!.id, people.Ann!.id],
    );
    expect(audit).toHaveLength(1);
    const cats = await query<{ n: string }>(
      "SELECT count(*) n FROM categories WHERE household_id = $1",
      [rows[0]!.id],
    );
    expect(Number(cats[0]!.n)).toBeGreaterThan(0);
  });

  test("ticking 'everyone must accept' creates a non-quick group", async ({ page }) => {
    const { people } = await createGroup({ Ann: "ADMIN" });
    const name = `Strict ${Date.now()}`;
    await signInAsPerson(page, people.Ann!);
    await page.goto("/households");
    await page.getByLabel("Group name").fill(name);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/households\/[0-9a-f-]{36}$/);
    const rows = await query<{ require_acceptance: boolean }>(
      "SELECT require_acceptance FROM households WHERE name = $1",
      [name],
    );
    expect(rows[0]!.require_acceptance).toBe(true);
  });

  test("an unauthenticated visitor is shown no groups and no create form", async ({
    page,
  }) => {
    const { name } = await createGroup({ Ann: "ADMIN" });
    await page.context().clearCookies();
    await page.goto("/households");
    await expect(page.getByText(name)).toHaveCount(0);
    await expect(page.getByLabel("Group name")).toHaveCount(0);
    const rows = await query("SELECT 1 FROM households WHERE name = $1", [name]);
    expect(rows).toHaveLength(1);
  });
});

test.describe("§23 limits: max_households_per_admin and the per-user override", () => {
  test("override of 1 blocks a second group; a super user raising it to 2 unblocks", async ({
    page,
  }) => {
    const { people } = await createGroup({ Ann: "ADMIN" }); // Ann already created 1
    const root = await createSuperUser();

    // Super user sets Ann's household limit to 1 through the console.
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row = page.locator("li").filter({ hasText: people.Ann!.email });
    await expect(row).toBeVisible();
    await row.locator("input").fill("1");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toHaveText("Saved");
    const set = await query<{ max_households_override: number }>(
      "SELECT max_households_override FROM users WHERE id = $1",
      [people.Ann!.id],
    );
    expect(set[0]!.max_households_override).toBe(1);

    // Ann is refused.
    const blockedName = `Blocked ${Date.now()}`;
    await signInAsPerson(page, people.Ann!);
    await page.goto("/households");
    await page.getByLabel("Group name").fill(blockedName);
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("up to 1 households");
    expect(
      await query("SELECT 1 FROM households WHERE name = $1", [blockedName]),
    ).toHaveLength(0);

    // Raised to 2, the same form now works.
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row2 = page.locator("li").filter({ hasText: people.Ann!.email });
    await row2.locator("input").fill("2");
    await row2.getByRole("button", { name: "Save" }).click();
    await expect(row2.getByRole("status")).toHaveText("Saved");

    await signInAsPerson(page, people.Ann!);
    await page.goto("/households");
    await page.getByLabel("Group name").fill(blockedName);
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/households\/[0-9a-f-]{36}$/);
    expect(
      await query("SELECT 1 FROM households WHERE name = $1", [blockedName]),
    ).toHaveLength(1);

    // Both overrides were audited at platform level.
    const audits = await query<{ after_json: { maxHouseholds: number } }>(
      `SELECT after_json FROM platform_audit_logs
        WHERE action = 'USER_LIMIT_CHANGED' AND entity_id = $1 AND actor_user_id = $2
        ORDER BY created_at`,
      [people.Ann!.id, root.id],
    );
    expect(audits.map((a) => a.after_json.maxHouseholds)).toEqual([1, 2]);
  });

  test("the limit counts groups the user created, not groups they merely joined", async ({
    page,
  }) => {
    // Bob is only a MEMBER of Ann's group, so he has created none.
    const { people } = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await query("UPDATE users SET max_households_override = 1 WHERE id = $1", [
      people.Bob!.id,
    ]);
    const name = `Bobs ${Date.now()}`;
    await signInAsPerson(page, people.Bob!);
    await page.goto("/households");
    await page.getByLabel("Group name").fill(name);
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/households\/[0-9a-f-]{36}$/);
    const role = await query<{ role: string }>(
      `SELECT m.role FROM household_members m JOIN households h ON h.id = m.household_id
        WHERE h.name = $1 AND m.user_id = $2`,
      [name, people.Bob!.id],
    );
    expect(role[0]!.role).toBe("ADMIN"); // a MEMBER elsewhere, ADMIN of their own
  });
});
