import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createGroup, signInAsPerson, type FixtureGroup } from "./support/fixtures";
import { query } from "./support/helpers";

/** Mirrors hashInvitationToken: hex SHA-256 of the raw token. */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function seedInvitation(
  g: FixtureGroup,
  opts: {
    email: string;
    role?: "ADMIN" | "MEMBER" | "VIEWER";
    status?: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    expiresInDays?: number;
  },
): Promise<string> {
  const token = `tok-${randomUUID()}`;
  await query(
    `INSERT INTO invitations (id, household_id, email, role, token_hash, status, invited_by_user_id, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' days')::interval)`,
    [
      randomUUID(),
      g.id,
      opts.email,
      opts.role ?? "MEMBER",
      hash(token),
      opts.status ?? "PENDING",
      g.people.Ann!.id,
      String(opts.expiresInDays ?? 7),
    ],
  );
  return token;
}

/** A signed-in user with no membership in `g`, in a group of their own. */
async function newcomer(page: Page, name: string, email?: string) {
  const other = await createGroup({ [name]: "ADMIN" });
  const person = other.people[name]!;
  if (email) await query(`UPDATE users SET email=$2 WHERE id=$1`, [person.id, email]);
  await signInAsPerson(page, person);
  return person;
}

async function role(g: FixtureGroup, userId: string) {
  const r = await query<{ role: string; removed_at: string | null }>(
    `SELECT role, removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
    [g.id, userId],
  );
  return r[0];
}

test.describe("§23 invitations: create and revoke from the members page", () => {
  test("admin invites by email, gets a link, can withdraw it; duplicates supersede", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const email = `invitee.${Date.now()}@example.test`;
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Invite by email" }).click();
    await page.locator("input[role=combobox]").fill(email);
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Invitation created" }),
    ).toBeVisible();
    const link = await page.getByLabel("Invitation link").inputValue();
    expect(link).toContain("/invite/");

    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const rows = await query<{ status: string; role: string; token_hash: string }>(
      `SELECT status, role, token_hash FROM invitations WHERE household_id=$1 AND email=$2`,
      [g.id, email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "PENDING", role: "MEMBER" });
    // Only the hash is stored, never the raw token.
    const token = decodeURIComponent(link.split("/invite/")[1]!);
    expect(rows[0]!.token_hash).toBe(hash(token));
    expect(
      (
        await query(
          `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='MEMBER_INVITED'`,
          [g.id],
        )
      ).length,
    ).toBe(1);

    // "New link" supersedes the old token.
    await page.getByRole("button", { name: "New link" }).click();
    await expect
      .poll(
        async () =>
          (
            await query(
              `SELECT 1 FROM invitations WHERE household_id=$1 AND email=$2 AND status='REVOKED'`,
              [g.id, email],
            )
          ).length,
      )
      .toBe(1);
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "This invitation cannot be used" }),
    ).toBeVisible();
    await expect(page.getByText("withdrawn")).toBeVisible();

    // Withdraw the live one.
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("No invitations outstanding")).toBeVisible();
    expect(
      (
        await query(
          `SELECT 1 FROM invitations WHERE household_id=$1 AND status='PENDING'`,
          [g.id],
        )
      ).length,
    ).toBe(0);
    expect(
      (
        await query(
          `SELECT 1 FROM audit_logs WHERE household_id=$1 AND action='INVITATION_REVOKED'`,
          [g.id],
        )
      ).length,
    ).toBe(1);
  });

  test("inviting an existing member (any email case) is refused", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Invite by email" }).click();
    await page.locator("input[role=combobox]").fill(g.people.Bob!.email.toUpperCase());
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "already a member" }),
    ).toBeVisible();
    expect(
      (await query(`SELECT 1 FROM invitations WHERE household_id=$1`, [g.id])).length,
    ).toBe(0);
  });

  test("member limit counts pending invitations", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    await query(`UPDATE households SET max_members_override = 2 WHERE id=$1`, [g.id]);
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);

    async function invite(email: string) {
      await page.getByRole("button", { name: "Invite by email" }).click();
      await page.locator("input[role=combobox]").fill(email);
      await page.getByRole("option").first().click();
      await page.getByRole("button", { name: "Invite", exact: true }).click();
    }
    const tag = Date.now();
    await invite(`one.${tag}@example.test`);
    await expect(
      page.getByRole("status").filter({ hasText: "Invitation created" }),
    ).toBeVisible();
    // 1 member + 1 pending = 2 = limit.
    await invite(`two.${tag}@example.test`);
    await expect(
      page.getByRole("alert").filter({ hasText: "limited to 2 members" }),
    ).toBeVisible();
    expect(
      (await query(`SELECT 1 FROM invitations WHERE household_id=$1`, [g.id])).length,
    ).toBe(1);

    // Tracked members count too.
    await page.getByRole("button", { name: "Track someone" }).click();
    await page.getByPlaceholder("Name").fill("Capped");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "limited to 2 members" }),
    ).toBeVisible();

    // Withdrawing frees the seat.
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("No invitations outstanding")).toBeVisible();
    await page.getByPlaceholder("Name").fill("Capped");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  });

  test("expired pending invitations do not count toward the limit", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    await query(`UPDATE households SET max_members_override = 2 WHERE id=$1`, [g.id]);
    await seedInvitation(g, {
      email: `old.${Date.now()}@example.test`,
      expiresInDays: -1,
    });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto(`/households/${g.id}/members`);
    await page.getByRole("button", { name: "Track someone" }).click();
    await page.getByPlaceholder("Name").fill("Fits");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  });
});

test.describe("§23 invitations: accepting through /invite/<token>", () => {
  test("signed-out visitor sees the invitation and is asked to sign in", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const token = await seedInvitation(g, { email: "x@example.test", role: "VIEWER" });
    await page.context().clearCookies();
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole("heading", { name: `Join ${g.name}` })).toBeVisible();
    await expect(page.getByText("Sign in to accept").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  });

  test("accept joins with the invited role, notifies, audits, and the link is single-use", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const token = await seedInvitation(g, { email: "dee@example.test", role: "VIEWER" });
    const dee = await newcomer(page, "Dee");
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole("heading", { name: `Join ${g.name}` })).toBeVisible();
    // Signed in with a different address than the invited one: warned, not blocked.
    await expect(
      page.getByText("This invitation was sent to dee@example.test"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(/\/households$/);

    expect((await role(g, dee.id))?.role).toBe("VIEWER");
    const audit = await query<{
      after_json: { invitedEmail: string; acceptedByEmail: string };
    }>(
      `SELECT after_json FROM audit_logs WHERE household_id=$1 AND action='INVITATION_ACCEPTED'`,
      [g.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after_json.invitedEmail).toBe("dee@example.test");
    expect(audit[0]!.after_json.acceptedByEmail).toBe(dee.email);
    expect(
      (
        await query(`SELECT 1 FROM notifications WHERE user_id=$1 AND household_id=$2`, [
          g.people.Ann!.id,
          g.id,
        ])
      ).length,
    ).toBeGreaterThan(0);

    // Dee now has access, as VIEWER.
    await page.goto(`/households/${g.id}/members`);
    await expect(page.getByRole("button", { name: "Track someone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave household" })).toBeVisible();

    // Reuse: a second person cannot use the same link.
    await newcomer(page, "Eli");
    await page.goto(`/invite/${token}`);
    await expect(
      page.getByRole("heading", { name: "This invitation cannot be used" }),
    ).toBeVisible();
    await expect(page.getByText("already been used")).toBeVisible();
  });

  test("an invited ADMIN becomes ADMIN; an invited MEMBER can create expenses", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const t1 = await seedInvitation(g, { email: "a@example.test", role: "ADMIN" });
    const p1 = await newcomer(page, "Fin");
    await page.goto(`/invite/${t1}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(/\/households$/);
    expect((await role(g, p1.id))?.role).toBe("ADMIN");

    const t2 = await seedInvitation(g, { email: "m@example.test", role: "MEMBER" });
    const p2 = await newcomer(page, "Gil");
    await page.goto(`/invite/${t2}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(/\/households$/);
    await page.goto(`/households/${g.id}/expenses/new`);
    await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
    expect((await role(g, p2.id))?.role).toBe("MEMBER");
  });

  const unusable: Array<
    [
      string,
      { status?: "REVOKED" | "EXPIRED" | "ACCEPTED"; expiresInDays?: number },
      string,
    ]
  > = [
    ["revoked", { status: "REVOKED" }, "withdrawn"],
    ["expired by date", { expiresInDays: -1 }, "expired"],
    ["marked EXPIRED", { status: "EXPIRED" }, "expired"],
    ["already accepted", { status: "ACCEPTED" }, "already been used"],
  ];
  for (const [label, opts, text] of unusable) {
    test(`a ${label} token cannot be used and grants nothing`, async ({ page }) => {
      const g = await createGroup({ Ann: "ADMIN" });
      const token = await seedInvitation(g, { email: "z@example.test", ...opts });
      const p = await newcomer(page, "Hal");
      await page.goto(`/invite/${token}`);
      await expect(
        page.getByRole("heading", { name: "This invitation cannot be used" }),
      ).toBeVisible();
      await expect(page.getByText(text)).toBeVisible();
      await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(
        0,
      );
      expect(await role(g, p.id)).toBeUndefined();
    });
  }

  test("an unknown token is not found", async ({ page }) => {
    await newcomer(page, "Ivy");
    await page.goto(`/invite/does-not-exist-${Date.now()}`);
    await expect(
      page.getByRole("heading", { name: "That link is not valid" }),
    ).toBeVisible();
  });

  test("a removed member who re-accepts gets their old row back with the new role", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await query(
      `UPDATE household_members SET removed_at = now() WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Bob!.id],
    );
    const token = await seedInvitation(g, { email: g.people.Bob!.email, role: "VIEWER" });
    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/invite/${token}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(/\/households$/);
    const rows = await query(
      `SELECT role, removed_at FROM household_members WHERE household_id=$1 AND user_id=$2`,
      [g.id, g.people.Bob!.id],
    );
    expect(rows).toEqual([{ role: "VIEWER", removed_at: null }]);
  });

  test("an invitation to a deactivated household is refused", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const token = await seedInvitation(g, { email: "q@example.test" });
    await query(
      `UPDATE households SET status='ARCHIVED', archived_at=now() WHERE id=$1`,
      [g.id],
    );
    const p = await newcomer(page, "Jo");
    await page.goto(`/invite/${token}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(/error=/);
    // The refusal must be shown to the person, not only put in the URL.
    await expect(
      page.getByRole("alert").filter({ hasText: "no longer active" }),
    ).toBeVisible();
    expect(await role(g, p.id)).toBeUndefined();
  });
});

test.describe("§23 emails are unique case-insensitively", () => {
  test("the database refuses a second account differing only by case", async () => {
    const tag = randomUUID().slice(0, 8);
    const email = `Case.${tag}@example.test`;
    await query(`INSERT INTO users (id, email, updated_at) VALUES ($1,$2, now())`, [
      randomUUID(),
      email,
    ]);
    await expect(
      query(`INSERT INTO users (id, email, updated_at) VALUES ($1,$2, now())`, [
        randomUUID(),
        email.toUpperCase(),
      ]),
    ).rejects.toThrow(/duplicate key|users_email_lower_key/);
  });
});
