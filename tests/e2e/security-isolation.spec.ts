import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createGroup, signInAsPerson, type FixtureGroup } from "./support/fixtures";
import { query } from "./support/helpers";

/**
 * §21 security / §2.4 guard chain: tenant isolation. A member of group A must get
 * a 404 (never 403, never data) for everything that belongs to group B.
 */

async function addExpense(page: Page, group: FixtureGroup, description: string) {
  await page.goto(`/households/${group.id}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill(description);
  await page.getByPlaceholder("59.41").fill("12.00");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL(new RegExp(`/households/${group.id}$`));
  const rows = await query<{ id: string }>(
    "SELECT id FROM expenses WHERE household_id = $1 AND description = $2",
    [group.id, description],
  );
  return rows[0]!.id;
}

async function addReceipt(group: FixtureGroup, uploader: string): Promise<string> {
  const id = randomUUID();
  const bytes = Buffer.from("not-really-a-jpeg");
  await query(
    `INSERT INTO file_uploads (id, household_id, uploaded_by_user_id, url, content_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, 'image/jpeg', $5, $6)`,
    [id, group.id, uploader, `/api/receipts/${id}`, bytes.length, bytes],
  );
  return id;
}

test.describe("§21 tenant isolation", () => {
  test("a member of group A cannot reach group B's pages, expense, receipt or export", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "mutates data; run once");
    const a = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const b = await createGroup({ Cat: "ADMIN", Dan: "MEMBER" });

    const secret = `Secret-B-${Date.now()}`;
    await signInAsPerson(page, b.people.Cat!);
    const expenseId = await addExpense(page, b, secret);
    const receiptId = await addReceipt(b, b.people.Cat!.id);

    // The owner can read all of it (guards the negative cases below).
    const ownerCookie = `authjs.session-token=${b.people.Cat!.token}`;
    const own = await request.get(`/api/receipts/${receiptId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(own.status()).toBe(200);
    expect(own.headers()["cache-control"]).toContain("private");
    const ownExport = await request.get(`/api/households/${b.id}/export`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownExport.status()).toBe(200);
    expect(await ownExport.text()).toContain(secret);

    // Ann belongs to A only.
    await signInAsPerson(page, a.people.Ann!);
    for (const path of [
      `/households/${b.id}`,
      `/households/${b.id}/expenses/${expenseId}`,
      `/households/${b.id}/expenses/new`,
      `/households/${b.id}/members`,
      `/households/${b.id}/payments`,
      `/households/${b.id}/history`,
    ]) {
      await page.goto(path);
      // Streamed pages answer 200 with the not-found UI, so assert the UI.
      await expect(page.getByText("This page could not be found"), path).toBeVisible();
      await expect(page.getByText(secret)).toHaveCount(0);
    }

    const annCookie = `authjs.session-token=${a.people.Ann!.token}`;
    const stolenReceipt = await request.get(`/api/receipts/${receiptId}`, {
      headers: { cookie: annCookie },
    });
    expect(stolenReceipt.status()).toBe(404);
    const stolenExport = await request.get(`/api/households/${b.id}/export`, {
      headers: { cookie: annCookie },
    });
    expect(stolenExport.status()).toBe(404);
    expect(await stolenExport.text()).not.toContain(secret);

    // A guessed id that exists nowhere looks exactly the same as one that does.
    const ghost = await request.get(`/api/receipts/${randomUUID()}`, {
      headers: { cookie: annCookie },
    });
    expect(ghost.status()).toBe(404);
    expect(await ghost.text()).toBe(await stolenReceipt.text());

    // Ann's own group's dashboard never leaks B's expense text.
    await page.goto(`/households/${a.id}`);
    await expect(page.getByText(secret)).toHaveCount(0);
    // Group B's expense id under group A's URL is not found either.
    await page.goto(`/households/${a.id}/expenses/${expenseId}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });

  test("a removed member loses the receipt and export too", async ({ request }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    const receiptId = await addReceipt(g, g.people.Ann!.id);
    const cookie = `authjs.session-token=${g.people.Bob!.token}`;
    expect(
      (await request.get(`/api/receipts/${receiptId}`, { headers: { cookie } })).status(),
    ).toBe(200);
    await query(
      "UPDATE household_members SET removed_at = now() WHERE household_id = $1 AND user_id = $2",
      [g.id, g.people.Bob!.id],
    );
    expect(
      (await request.get(`/api/receipts/${receiptId}`, { headers: { cookie } })).status(),
    ).toBe(404);
    expect(
      (
        await request.get(`/api/households/${g.id}/export`, { headers: { cookie } })
      ).status(),
    ).toBe(404);
  });

  test("a malformed household id never produces a 500", async ({ request }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const cookie = `authjs.session-token=${g.people.Ann!.token}`;
    const r = await request.get(`/api/households/not-a-uuid/export`, {
      headers: { cookie },
    });
    expect(r.status()).toBe(404);
  });
});
