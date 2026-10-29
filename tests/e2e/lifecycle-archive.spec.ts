import { expect, test, type Page } from "@playwright/test";

import {
  createGroup,
  createSuperUser,
  signInAsPerson,
  type FixtureGroup,
} from "./support/fixtures";
import { query } from "./support/helpers";

const NOT_FOUND = "This page could not be found";

const subpaths = (id: string) => [
  `/households/${id}`,
  `/households/${id}/members`,
  `/households/${id}/payments`,
  `/households/${id}/history`,
  `/households/${id}/expenses/new`,
];

async function status(id: string): Promise<string> {
  const rows = await query<{ status: string }>(
    "SELECT status FROM households WHERE id = $1",
    [id],
  );
  return rows[0]!.status;
}

async function expectGone(page: Page, id: string) {
  for (const path of subpaths(id)) {
    await page.goto(path);
    await expect(page.getByText(NOT_FOUND), path).toBeVisible();
  }
}

async function adminArchives(page: Page, group: FixtureGroup) {
  await signInAsPerson(page, group.people.Ann!);
  await page.goto(`/households/${group.id}/members`);
  await page.getByRole("button", { name: "Deactivate household" }).click();
  await page.getByRole("button", { name: "Yes, deactivate" }).click();
  await page.waitForURL(/\/households$/);
}

test.describe("§24 household lifecycle: ACTIVE -> ARCHIVED -> restore", () => {
  test("only an admin is offered Deactivate; a member and a viewer are not", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    for (const who of ["Bob", "Eve"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(`/households/${g.id}/members`);
      await expect(
        page.getByRole("heading", { name: "Members", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Deactivate household" }),
      ).toHaveCount(0);
    }
    expect(await status(g.id)).toBe("ACTIVE");
  });

  test("admin archives: members and outsiders get 404 everywhere, audit + notification written", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" });
    const out = (await createGroup({ Zed: "ADMIN" })).people.Zed!;
    await adminArchives(page, g);

    const rows = await query<{ status: string; archived_at: Date | null }>(
      "SELECT status, archived_at FROM households WHERE id = $1",
      [g.id],
    );
    expect(rows[0]!.status).toBe("ARCHIVED");
    expect(rows[0]!.archived_at).not.toBeNull();
    const audit = await query(
      `SELECT 1 FROM audit_logs WHERE household_id = $1 AND action = 'HOUSEHOLD_ARCHIVED' AND actor_user_id = $2`,
      [g.id, g.people.Ann!.id],
    );
    expect(audit).toHaveLength(1);
    // Members (not the actor) are told.
    const notes = await query<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE household_id = $1 AND type = 'HOUSEHOLD_DEACTIVATED'`,
      [g.id],
    );
    const told = notes.map((n) => n.user_id);
    expect(told).toContain(g.people.Bob!.id);
    expect(told).toContain(g.people.Eve!.id);

    for (const who of [g.people.Bob!, g.people.Eve!, g.people.Ann!, out]) {
      await signInAsPerson(page, who);
      await expectGone(page, g.id);
      // and it is not listed
      await page.goto("/households");
      await expect(page.getByText(g.name).first(), who.name).toHaveCount(
        who === g.people.Ann ? 1 : 0, // Ann sees it only in the Deactivated card
      );
    }
  });

  test("a member cannot restore; the admin restores while ARCHIVED and access returns", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await adminArchives(page, g);

    await signInAsPerson(page, g.people.Bob!);
    await page.goto("/households");
    await expect(page.getByRole("heading", { name: "Your households" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);

    await signInAsPerson(page, g.people.Ann!);
    await page.goto("/households");
    const card = page.locator("li").filter({ hasText: g.name });
    await expect(card).toContainText("Deleted permanently in 30 days");
    await card.getByRole("button", { name: "Restore" }).click();
    await expect(card).toHaveCount(0);
    expect(await status(g.id)).toBe("ACTIVE");
    expect(
      (await query("SELECT archived_at FROM households WHERE id=$1", [g.id]))[0],
    ).toMatchObject({ archived_at: null });

    const audit = await query(
      `SELECT 1 FROM audit_logs WHERE household_id = $1 AND action = 'HOUSEHOLD_RESTORED'`,
      [g.id],
    );
    expect(audit).toHaveLength(1);

    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.getByText(g.name).first()).toBeVisible();
  });

  test("a super user still sees an archived group, but it is read-only for them", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const root = await createSuperUser();
    await adminArchives(page, g);

    await signInAsPerson(page, root);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText(g.name).first()).toBeVisible();
    await expect(page.locator(`a[href="/households/${g.id}/expenses/new"]`)).toHaveCount(
      0,
    );
    // Add expense / payment: denied.
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();

    // Invite: the members page offers no way to add someone.
    await page.goto(`/households/${g.id}/members`);
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toHaveCount(0);
    expect(
      await query("SELECT 1 FROM invitations WHERE household_id = $1", [g.id]),
    ).toHaveLength(0);

    // The console lists it as archived, with no Deactivate/Activate toggle.
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row = page
      .locator("li")
      .filter({ hasText: g.name })
      .filter({ hasText: "expenses" });
    await expect(row).toContainText("archived");
    await expect(row.getByRole("button", { name: /Deactivate|Activate/ })).toHaveCount(0);
  });
});

test.describe("§24 SUSPENDED: only a super user lifts it", () => {
  test("super user suspends; members 404, admin gets no Restore; only super user reactivates", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const root = await createSuperUser();

    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row = page
      .locator("li")
      .filter({ hasText: g.name })
      .filter({ hasText: "expenses" });
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("suspended");
    expect(await status(g.id)).toBe("SUSPENDED");

    const platform = await query<{ action: string }>(
      `SELECT action FROM platform_audit_logs WHERE entity_id = $1 AND actor_user_id = $2`,
      [g.id, root.id],
    );
    expect(platform.map((p) => p.action)).toEqual(["HOUSEHOLD_SUSPENDED"]);
    expect(
      await query(
        `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='HOUSEHOLD_SUSPENDED'`,
        [g.id],
      ),
    ).toHaveLength(1);

    for (const who of [g.people.Ann!, g.people.Bob!]) {
      await signInAsPerson(page, who);
      await expectGone(page, g.id);
      await page.goto("/households");
      await expect(page.getByRole("heading", { name: "Your households" })).toBeVisible();
      // Not an ARCHIVED group: no admin-side Restore path exists.
      await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
    }
    expect(await status(g.id)).toBe("SUSPENDED");

    // Super user lifts it.
    await signInAsPerson(page, root);
    await page.goto("/admin", { waitUntil: "networkidle" });
    const row2 = page
      .locator("li")
      .filter({ hasText: g.name })
      .filter({ hasText: "expenses" });
    await row2.getByRole("button", { name: "Activate" }).click();
    await expect(row2).not.toContainText("suspended");
    expect(await status(g.id)).toBe("ACTIVE");

    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}`);
    await expect(page.getByText(g.name).first()).toBeVisible();
  });
});

test.describe("§2.4d outsiders never learn a group exists", () => {
  test("an outsider gets the same 404 for a real group and a made-up one", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const out = (await createGroup({ Zed: "ADMIN" })).people.Zed!;
    await signInAsPerson(page, out);
    const fake = "00000000-0000-4000-8000-000000000000";
    // Streaming responses commit their status before notFound() runs, so the
    // code may be 200; what matters is a real group is indistinguishable from
    // an invented one, in status and in body.
    for (let i = 0; i < subpaths(g.id).length; i++) {
      const real = subpaths(g.id)[i]!;
      const made = subpaths(fake)[i]!;
      const a = await page.goto(real);
      await expect(page.getByText(NOT_FOUND), real).toBeVisible();
      const bodyA = (await page.locator("main, body").first().innerText()).replaceAll(
        g.id,
        "ID",
      );
      const b = await page.goto(made);
      await expect(page.getByText(NOT_FOUND), made).toBeVisible();
      const bodyB = (await page.locator("main, body").first().innerText()).replaceAll(
        fake,
        "ID",
      );
      expect(a?.status(), real).toBe(b?.status());
      expect(bodyA).toBe(bodyB);
      await expect(page.getByText(g.name)).toHaveCount(0);
    }
  });

  test("a removed member is an outsider too", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await query(
      "UPDATE household_members SET removed_at = now() WHERE household_id=$1 AND user_id=$2",
      [g.id, g.people.Bob!.id],
    );
    await signInAsPerson(page, g.people.Bob!);
    await expectGone(page, g.id);
  });
});
