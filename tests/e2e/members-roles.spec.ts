import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson, type FixturePerson } from "./support/fixtures";
import { query } from "./support/helpers";

/** Adds a standalone user (no membership in the group under test). */
async function loneUser(
  name: string,
  opts: { superUser?: boolean } = {},
): Promise<FixturePerson> {
  const tag = randomUUID().slice(0, 8);
  const id = randomUUID();
  const email = `${name.toLowerCase()}.${tag}@example.test`;
  const token = `e2e-${tag}-${name.toLowerCase()}`;
  await query(
    `INSERT INTO users (id, name, email, email_verified, is_super_user, updated_at)
     VALUES ($1,$2,$3, now(), $4, now())`,
    [id, name, email, opts.superUser ?? false],
  );
  await query(
    `INSERT INTO sessions (id, session_token, user_id, expires)
     VALUES ($1,$2,$3, now() + interval '7 days')`,
    [randomUUID(), token, id],
  );
  return { id, name, email, token };
}

test.describe("§5 role matrix: members page and household controls", () => {
  test("ADMIN sees every management control", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Track someone" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite by email" })).toBeVisible();
    await expect(page.getByText("Pending invitations")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(
      3,
    );
    await expect(
      page.getByRole("button", { name: "Deactivate household" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();

    await page.goto(`/households/${g.id}`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(
      page.locator(`a[href="/households/${g.id}/expenses/new"]`).first(),
    ).toBeVisible();
  });

  for (const [who, role] of [
    ["Bob", "MEMBER"],
    ["Eve", "VIEWER"],
  ] as const) {
    test(`${role} sees no management controls, only Leave`, async ({ page }) => {
      const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
      await signInAsPerson(page, g.people[who]!);
      await page.goto(`/households/${g.id}/members`);
      await expect(
        page.getByRole("heading", { name: "Members", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("3 members")).toBeVisible();
      await expect(page.getByRole("button", { name: "Track someone" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Invite by email" })).toHaveCount(0);
      await expect(page.getByText("Pending invitations")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(
        0,
      );
      await expect(page.locator("select")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Deactivate household" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();

      await page.goto(`/households/${g.id}`);
      await expect(page.getByRole("heading", { name: "Settings" })).toHaveCount(0);
    });
  }

  test("VIEWER cannot reach the add-expense form; MEMBER can", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    await signInAsPerson(page, g.people.Eve!);
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  });

  test("outsider and removed member get 404 on every household page", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Gus: "MEMBER" });
    await query(
      `UPDATE household_members SET removed_at = now() WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Gus!.id],
    );
    const outsider = await loneUser("Fay");
    for (const person of [outsider, g.people.Gus!]) {
      await signInAsPerson(page, person);
      for (const path of ["", "/members", "/history", "/payments", "/expenses/new"]) {
        await page.goto(`/households/${g.id}${path}`);
        await expect(page.getByText("This page could not be found")).toBeVisible();
      }
    }
  });
});

test.describe("§23 membership changes by an admin", () => {
  test("admin changes a role and the audit log records it", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    const row = page.locator("li").filter({ hasText: "Bob" }).first();
    await row.locator("select").selectOption("VIEWER");
    await expect
      .poll(async () => {
        const r = await query<{ role: string }>(
          `SELECT role FROM household_members WHERE household_id=$1 AND user_id=$2`,
          [g.id, g.people.Bob!.id],
        );
        return r[0]?.role;
      })
      .toBe("VIEWER");
    const audit = await query(
      `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='ROLE_CHANGED'`,
      [g.id],
    );
    expect(audit.length).toBe(1);

    // The demoted person immediately loses create rights.
    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });

  test("admin removes a member: soft removal, access ends, audit written", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    const row = page.locator("li").filter({ hasText: "Bob" }).first();
    await row.getByRole("button", { name: "Remove", exact: true }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("1 member", { exact: true })).toBeVisible();

    const rows = await query<{ removed_at: string | null }>(
      `SELECT removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Bob!.id],
    );
    expect(rows).toHaveLength(1); // row kept (§2.2)
    expect(rows[0]!.removed_at).not.toBeNull();
    expect(
      (
        await query(
          `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='MEMBER_REMOVED'`,
          [g.id],
        )
      ).length,
    ).toBe(1);

    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });

  test("the only admin can be neither demoted nor removed", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    const row = page.locator("li").filter({ hasText: "Ann" }).first();

    await row.locator("select").selectOption("MEMBER");
    await expect(page.getByRole("alert").filter({ hasText: "only admin" })).toBeVisible();

    await row.getByRole("button", { name: "Remove", exact: true }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "only admin" })).toBeVisible();

    const r = await query<{ role: string; removed_at: string | null }>(
      `SELECT role, removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Ann!.id],
    );
    expect(r[0]!.role).toBe("ADMIN");
    expect(r[0]!.removed_at).toBeNull();
  });

  test("only admin cannot leave; once another admin exists they can", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Leave household" }).click();
    await page.getByRole("button", { name: "Yes, leave" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "only admin" })).toBeVisible();

    await query(
      `UPDATE household_members SET role='ADMIN' WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Bob!.id],
    );
    await page.getByRole("button", { name: "Leave household" }).click();
    await page.getByRole("button", { name: "Yes, leave" }).click();
    await page.waitForURL(/\/households$/);
    const r = await query<{ removed_at: string | null }>(
      `SELECT removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Ann!.id],
    );
    expect(r[0]!.removed_at).not.toBeNull();
    expect(
      (
        await query(
          `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='MEMBER_LEFT'`,
          [g.id],
        )
      ).length,
    ).toBe(1);
  });

  test("a MEMBER can leave and loses access", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Leave household" }).click();
    await page.getByRole("button", { name: "Yes, leave" }).click();
    await page.waitForURL(/\/households$/);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});

test.describe("§5/§23 super-user permission overrides reach the screens", () => {
  test("granting MEMBER 'deactivate household' shows the control, revoking hides it", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const sue = await loneUser("Sue", { superUser: true });
    const cap = "ARCHIVE_HOUSEHOLD";
    await query(
      `DELETE FROM permission_overrides WHERE role='MEMBER' AND capability=$1`,
      [cap],
    );
    try {
      await signInAsPerson(page, g.people.Bob!);
      await page.goto(`/households/${g.id}/members`);
      await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Deactivate household" }),
      ).toHaveCount(0);

      // The super user flips the switch in the console.
      await signInAsPerson(page, sue);
      await page.goto(`/admin`);
      // The console hydrates slowly, and a tap before that is silently dropped.
      await page.waitForLoadState("networkidle");
      const sw = page.getByRole("switch", { name: "MEMBER deactivate this household" });
      await expect(sw).toHaveAttribute("aria-checked", "false");
      // Retry only while it still reads off, so a late hydration cannot double-toggle.
      await expect(async () => {
        if ((await sw.getAttribute("aria-checked")) === "false") await sw.click();
        await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await expect
        .poll(
          async () =>
            (
              await query(
                `SELECT 1 FROM permission_overrides WHERE role='MEMBER' AND capability=$1 AND allowed`,
                [cap],
              )
            ).length,
        )
        .toBe(1);
      expect(
        (
          await query(
            `SELECT 1 FROM platform_audit_logs ORDER BY created_at DESC LIMIT 1`,
          )
        ).length,
      ).toBe(1);

      await signInAsPerson(page, g.people.Bob!);
      await page.goto(`/households/${g.id}/members`);
      await expect(
        page.getByRole("button", { name: "Deactivate household" }),
      ).toBeVisible();

      // Non-super-user cannot reach the console.
      await page.goto(`/admin`);
      await expect(
        page.getByRole("switch", { name: "MEMBER deactivate this household" }),
      ).toHaveCount(0);
    } finally {
      await query(
        `DELETE FROM permission_overrides WHERE role='MEMBER' AND capability=$1`,
        [cap],
      );
    }

    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}/members`);
    await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deactivate household" })).toHaveCount(
      0,
    );
  });

  test("admin's manage-members switch is locked", async ({ page }) => {
    const sue = await loneUser("Sue", { superUser: true });
    await signInAsPerson(page, sue);
    await page.goto(`/admin`);
    await expect(
      page.getByRole("switch", {
        name: /^ADMIN invite, remove, or change the role of a member$/,
      }),
    ).toBeDisabled();
  });
});
