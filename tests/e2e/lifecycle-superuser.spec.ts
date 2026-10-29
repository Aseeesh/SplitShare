import { expect, test } from "@playwright/test";

import { createGroup, createSuperUser, signInAsPerson } from "./support/fixtures";
import { query } from "./support/helpers";

const NOT_FOUND = "This page could not be found";

test.describe("§23 super user console", () => {
  test("admins, members, viewers and signed-out visitors get 404 and none of the console", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    for (const who of ["Ann", "Bob", "Eve"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto("/admin", { waitUntil: "networkidle" });
      await expect(page.getByText(NOT_FOUND), who).toBeVisible();
      await expect(page.getByText("Super user console")).toHaveCount(0);
      await expect(page.getByText("Platform limits")).toHaveCount(0);
      await expect(page.getByText(g.people.Bob!.email)).toHaveCount(0);
    }
    await page.context().clearCookies();
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
  });

  test("the console is not linked from a normal user's navigation", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto("/households");
    await expect(page.getByRole("heading", { name: "Your households" })).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  });

  test("a super user sees every household and user, and the permission matrix", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const root = await createSuperUser();
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Super user console" })).toBeVisible();
    await expect(page.getByText(g.name).first()).toBeVisible(); // no membership needed
    await expect(page.getByText(g.people.Bob!.email)).toBeVisible();
    await expect(page.getByText("Roles & permissions")).toBeVisible();
    await expect(page.getByText(`${root.name}`).first()).toBeVisible();
  });

  test("a super user can read a group they do not belong to, but cannot add to it", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const root = await createSuperUser();
    await signInAsPerson(page, root);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText(g.name).first()).toBeVisible();
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
  });
});

test.describe("§23 suspending users", () => {
  test("super user suspends a member: sessions die, next request is signed out, audit rows written", async ({
    page,
    browser,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const root = await createSuperUser();

    // Bob is signed in and can see his group.
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await bobCtx.addCookies([
      {
        name: "authjs.session-token",
        value: g.people.Bob!.token,
        url: "http://localhost:" + (process.env.E2E_PORT ?? 3100),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await bob.goto(`/households/${g.id}`);
    await expect(bob.getByText(g.name).first()).toBeVisible();

    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row = page.locator("li").filter({ hasText: g.people.Bob!.email });
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(row).toContainText("suspended");

    const u = await query<{ disabled_at: Date | null }>(
      "SELECT disabled_at FROM users WHERE id = $1",
      [g.people.Bob!.id],
    );
    expect(u[0]!.disabled_at).not.toBeNull();
    expect(
      await query("SELECT 1 FROM sessions WHERE user_id = $1", [g.people.Bob!.id]),
    ).toHaveLength(0);

    // Bob's next request: no group, no create form, signed-out landing page.
    await bob.goto(`/households/${g.id}`);
    await expect(bob.getByText(g.name)).toHaveCount(0);
    await bob.goto("/households");
    await expect(bob.getByLabel("Group name")).toHaveCount(0);
    await bob.goto("/");
    await expect(bob.getByText(/^Hi Bob/)).toHaveCount(0);
    await expect(bob.locator('a[href="/households"]')).toHaveCount(0);
    await bobCtx.close();

    // Even with a session row smuggled back in, requireAuth re-checks the flag.
    await query(
      `INSERT INTO sessions (id, session_token, user_id, expires)
       VALUES (gen_random_uuid(), $1, $2, now() + interval '1 day')`,
      ["e2e-smuggled-" + Date.now(), g.people.Bob!.id],
    );
    const smuggled = (
      await query<{ session_token: string }>(
        "SELECT session_token FROM sessions WHERE user_id = $1",
        [g.people.Bob!.id],
      )
    )[0]!.session_token;
    await signInAsPerson(page, { ...g.people.Bob!, token: smuggled });
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText(g.name)).toHaveCount(0);

    const platform = await query<{ action: string }>(
      `SELECT action FROM platform_audit_logs WHERE entity_id = $1 AND actor_user_id = $2`,
      [g.people.Bob!.id, root.id],
    );
    expect(platform.map((p) => p.action)).toEqual(["USER_DISABLED"]);
    const household = await query(
      `SELECT 1 FROM audit_logs WHERE household_id = $1 AND action = 'USER_DISABLED' AND entity_id = $2`,
      [g.id, g.people.Bob!.id],
    );
    expect(household).toHaveLength(1);

    // Reinstating works and is audited.
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row2 = page.locator("li").filter({ hasText: g.people.Bob!.email });
    await row2.getByRole("button", { name: "Reinstate" }).click();
    await expect(row2).not.toContainText("suspended");
    const after = await query<{ action: string }>(
      `SELECT action FROM platform_audit_logs WHERE entity_id = $1 ORDER BY created_at`,
      [g.people.Bob!.id],
    );
    expect(after.map((p) => p.action)).toEqual(["USER_DISABLED", "USER_ENABLED"]);
  });

  test("a super user has no Suspend control for themself or another super user", async ({
    page,
  }) => {
    const root = await createSuperUser("Rootone");
    const other = await createSuperUser("Roottwo");
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    for (const email of [root.email, other.email]) {
      const row = page.locator("li").filter({ hasText: email });
      await expect(row).toBeVisible();
      await expect(row.getByRole("button", { name: /Suspend|Reinstate/ })).toHaveCount(0);
    }
    expect(
      await query("SELECT disabled_at FROM users WHERE id = ANY($1)", [
        [root.id, other.id],
      ]),
    ).toEqual([{ disabled_at: null }, { disabled_at: null }]);
  });

  test("a regular user cannot reach the suspend action (no console, no effect)", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend" })).toHaveCount(0);
  });
});

test.describe("§23 editing limits and the permission matrix writes platform_audit_logs", () => {
  test("platform limits: saving writes an audit row with before/after", async ({
    page,
  }) => {
    const root = await createSuperUser();
    const before = await query<{ key: string; value: unknown }>(
      "SELECT key, value FROM platform_settings",
    );
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    // Save the household default unchanged (shared DB: never alter global limits).
    const field = page
      .locator("div")
      .filter({ hasText: /^Households per admin/ })
      .last();
    const input = field.locator("input");
    const current = await input.inputValue();
    await input.fill(current);
    await field.getByRole("button", { name: "Save" }).click();
    await expect(field.getByRole("status")).toHaveText("Saved");

    const audit = await query<{
      before_json: unknown;
      after_json: Record<string, number>;
    }>(
      `SELECT before_json, after_json FROM platform_audit_logs
        WHERE action = 'PLATFORM_LIMITS_CHANGED' AND actor_user_id = $1`,
      [root.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after_json.maxHouseholdsPerAdmin).toBe(Number(current));
    expect(audit[0]!.before_json).toBeTruthy();
    expect(before.length).toBeGreaterThanOrEqual(0);
  });

  test("household member limit: override is stored, audited, and cleared by a blank save", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const root = await createSuperUser();
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row = page
      .locator("li")
      .filter({ hasText: g.name })
      .filter({ hasText: "expenses" });
    await row.locator("input").fill("3");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toHaveText("Saved");
    expect(
      (
        await query("SELECT max_members_override m FROM households WHERE id=$1", [g.id])
      )[0],
    ).toEqual({ m: 3 });
    await row.locator("input").fill("");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toHaveText("Saved");
    expect(
      (
        await query("SELECT max_members_override m FROM households WHERE id=$1", [g.id])
      )[0],
    ).toEqual({ m: null });
    const actions = await query<{
      action: string;
      after_json: { maxMembers: number | null };
    }>(
      `SELECT action, after_json FROM platform_audit_logs
        WHERE entity_id = $1 AND actor_user_id = $2 ORDER BY created_at`,
      [g.id, root.id],
    );
    expect(actions.map((a) => a.action)).toEqual([
      "HOUSEHOLD_LIMIT_CHANGED",
      "HOUSEHOLD_LIMIT_CHANGED",
    ]);
    expect(actions.map((a) => a.after_json.maxMembers)).toEqual([3, null]);
  });

  test("member limit of 1 stops an admin inviting a second person", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    await query("UPDATE households SET max_members_override = 1 WHERE id = $1", [g.id]);
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    const email = `limit.${Date.now()}@example.test`;
    await page.getByRole("button", { name: "Invite by email" }).click();
    const box = page.getByPlaceholder("Type an email address");
    await box.fill(email);
    await box.press("Enter");
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("limited to 1 members");
    expect(
      await query("SELECT 1 FROM invitations WHERE household_id=$1", [g.id]),
    ).toHaveLength(0);
  });

  test("permission matrix: a toggle persists an override, is audited, and restoring clears it", async ({
    page,
  }) => {
    const root = await createSuperUser();
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const sw = page.getByRole("switch", { name: "VIEWER delete any expense" });
    await expect(sw).toHaveAttribute("aria-checked", "false");
    try {
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "true");
      await expect
        .poll(
          async () =>
            (
              await query(
                "SELECT allowed FROM permission_overrides WHERE role='VIEWER' AND capability='DELETE_ANY_EXPENSE'",
              )
            )[0],
        )
        .toEqual({ allowed: true });
      // The matrix ignores taps while a save is in flight, so retry until it lands.
      await expect(async () => {
        await sw.click();
        await expect(sw).toHaveAttribute("aria-checked", "false", { timeout: 1500 });
      }).toPass({ timeout: 15_000 });
      await expect
        .poll(
          async () =>
            (
              await query(
                "SELECT 1 FROM permission_overrides WHERE role='VIEWER' AND capability='DELETE_ANY_EXPENSE'",
              )
            ).length,
        )
        .toBe(0);
    } finally {
      await query(
        "DELETE FROM permission_overrides WHERE role='VIEWER' AND capability='DELETE_ANY_EXPENSE'",
      );
    }
    const audit = await query<{ after_json: { override: boolean | null } }>(
      `SELECT after_json FROM platform_audit_logs
        WHERE action='PERMISSION_CHANGED' AND entity_id='VIEWER:DELETE_ANY_EXPENSE' AND actor_user_id=$1
        ORDER BY created_at`,
      [root.id],
    );
    expect(audit.map((a) => a.after_json.override)).toEqual([true, null]);
  });

  test("the admin's own VIEW and MANAGE_MEMBERS switches are locked", async ({
    page,
  }) => {
    const root = await createSuperUser();
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("switch", { name: "ADMIN view this household" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("switch", {
        name: "ADMIN invite, remove, or change the role of a member",
      }),
    ).toBeDisabled();
  });
});
