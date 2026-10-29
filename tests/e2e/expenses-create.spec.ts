import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";
import { query } from "./support/helpers";
import {
  TINY_JPEG,
  auditActions,
  createViaUi,
  expenseByDescription,
  fillExpenseForm,
  removeMember,
  splitsOf,
} from "./support/expenses";

test.describe("§6 §2.5 §2.6 expense creation: server recomputes every split", () => {
  test("EQUAL: 10.00 over three people, leftover cent goes to the lowest userId", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Cal: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const description = `equal ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", { description, amount: "10.00" });
    const e = await expenseByDescription(g, description);
    expect(e.split_method).toBe("EQUAL");
    expect(Number(e.amount_cents)).toBe(1000);
    const splits = await splitsOf(g, id);
    expect(Object.values(splits).reduce((a, b) => a + b, 0)).toBe(1000);
    const ids = Object.values(g.people)
      .map((p) => p.id)
      .sort();
    const lowest = Object.values(g.people).find((p) => p.id === ids[0])!;
    for (const [name, cents] of Object.entries(splits)) {
      expect(cents, name).toBe(name === lowest.name ? 334 : 333);
    }
  });

  test("EXACT: amounts are stored as entered, sum equals total", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const description = `exact ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", {
      description,
      amount: "10.00",
      method: "EXACT",
      weights: { Ann: "3.00", Bob: "7.00" },
    });
    expect(await splitsOf(g, id)).toEqual({ Ann: 300, Bob: 700 });
  });

  test("EXACT: amounts that do not sum to the total cannot be submitted", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await fillExpenseForm(page, g, "Ann", {
      description: `bad exact ${Date.now()}`,
      amount: "10.00",
      method: "EXACT",
      weights: { Ann: "3.00", Bob: "6.00" },
    });
    await expect(page.locator("p[role=alert]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  test("PERCENTAGE 50/30/20 of 0.99: leftover pennies by amount desc", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Cal: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const description = `pct ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", {
      description,
      amount: "0.99",
      method: "PERCENTAGE",
      weights: { Ann: "50", Bob: "30", Cal: "20" },
    });
    const splits = await splitsOf(g, id);
    expect(splits.Ann! + splits.Bob! + splits.Cal!).toBe(99);
    // 49.5/29.7/19.8 floored = 49/29/19, two pennies left: largest two get one each.
    expect(splits).toEqual({ Ann: 50, Bob: 30, Cal: 19 });
    const bps = await query<{ name: string; percent_bps: number }>(
      `SELECT u.name, s.percent_bps FROM expense_splits s JOIN users u ON u.id=s.user_id
        WHERE s.expense_id=$1`,
      [id],
    );
    expect(Object.fromEntries(bps.map((r) => [r.name, r.percent_bps]))).toEqual({
      Ann: 5000,
      Bob: 3000,
      Cal: 2000,
    });
  });

  test("PERCENTAGE that does not total 100% is refused", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await fillExpenseForm(page, g, "Ann", {
      description: `bad pct ${Date.now()}`,
      amount: "10.00",
      method: "PERCENTAGE",
      weights: { Ann: "60", Bob: "30" },
    });
    await expect(page.locator("p[role=alert]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add expense" })).toBeDisabled();
  });

  test("SHARES 2:1 of 1.00: leftover cent to the larger share", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const description = `shares ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", {
      description,
      amount: "1.00",
      method: "SHARES",
      weights: { Ann: "2", Bob: "1" },
    });
    expect(await splitsOf(g, id)).toEqual({ Ann: 67, Bob: 33 });
  });

  test("participants can be a subset; excluded people get no split", async ({ page }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Cal: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const id = await createViaUi(page, g, "Ann", {
      description: `subset ${Date.now()}`,
      amount: "9.00",
      exclude: ["Cal"],
    });
    expect(await splitsOf(g, id)).toEqual({ Ann: 450, Bob: 450 });
  });
});

test.describe("§6 validation", () => {
  test("zero amount, empty description and junk amount disable submit", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    const submit = page.getByRole("button", { name: "Add expense" });

    await fillExpenseForm(page, g, "Ann", { description: "x", amount: "0" });
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("59.41").fill("abc");
    await expect(page.getByText("That is not an amount")).toBeVisible();
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("59.41").fill("5.00");
    await page.getByPlaceholder("Groceries").fill("");
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("Groceries").fill("ok now");
    await expect(submit).toBeEnabled();

    // Nobody selected -> nothing to split.
    for (const n of ["You", "Bob"]) {
      await page
        .locator("li")
        .filter({ has: page.locator("label", { hasText: n }) })
        .getByRole("checkbox")
        .uncheck();
    }
    await expect(submit).toBeDisabled();
    expect(await auditActions(g)).toEqual([]);
  });
});

test.describe("§5 §2.4 who may create an expense", () => {
  test("ADMIN and MEMBER can; VIEWER, outsider and removed member get 404", async ({
    page,
  }) => {
    const g = await createGroup({
      Ann: "ADMIN",
      Bob: "MEMBER",
      Eve: "VIEWER",
      Out: "MEMBER", // becomes an outsider below by never joining: separate group
      Gus: "MEMBER",
    });
    await removeMember(g, "Gus");
    await query("DELETE FROM household_members WHERE household_id=$1 AND user_id=$2", [
      g.id,
      g.people.Out!.id,
    ]);
    const url = `/households/${g.id}/expenses/new`;

    for (const who of ["Ann", "Bob"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
    }
    for (const who of ["Eve", "Out", "Gus"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(url);
      await expect(page.getByText("This page could not be found")).toBeVisible();
    }
  });

  test("removed member and outsider cannot read the expense either", async ({ page }) => {
    const g = await createGroup({
      Ann: "ADMIN",
      Bob: "MEMBER",
      Gus: "MEMBER",
      Zed: "ADMIN",
    });
    await signInAsPerson(page, g.people.Ann!);
    const description = `private ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", {
      description,
      amount: "4.00",
      exclude: ["Gus", "Zed"],
    });
    await removeMember(g, "Gus");
    await query("DELETE FROM household_members WHERE household_id=$1 AND user_id=$2", [
      g.id,
      g.people.Zed!.id,
    ]);
    for (const who of ["Gus", "Zed"]) {
      await signInAsPerson(page, g.people[who]!);
      await page.goto(`/households/${g.id}/expenses/${id}`);
      await expect(page.getByText("This page could not be found")).toBeVisible();
    }
    await signInAsPerson(page, g.people.Bob!);
    await page.goto(`/households/${g.id}/expenses/${id}`);
    await expect(page.getByRole("heading", { name: description })).toBeVisible();
  });
});

test.describe("§6 receipts", () => {
  test("a JPEG receipt is stored, linked, shown, and only members can fetch it", async ({
    page,
    request,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER", Out: "MEMBER" });
    await query("DELETE FROM household_members WHERE household_id=$1 AND user_id=$2", [
      g.id,
      g.people.Out!.id,
    ]);
    await signInAsPerson(page, g.people.Ann!);
    const description = `receipt ${Date.now()}`;
    const id = await createViaUi(page, g, "Ann", {
      description,
      amount: "12.00",
      receipt: { name: "r.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
    });
    const e = await expenseByDescription(g, description);
    expect(e.receipt_file_id).not.toBeNull();
    const files = await query<{ content_type: string; size_bytes: number }>(
      "SELECT content_type, size_bytes FROM file_uploads WHERE id=$1",
      [e.receipt_file_id],
    );
    expect(files[0]!.content_type).toBe("image/jpeg");
    expect(Number(files[0]!.size_bytes)).toBe(TINY_JPEG.length);

    await page.goto(`/households/${g.id}/expenses/${id}`);
    await expect(
      page.getByRole("img", { name: `Receipt for ${description}` }),
    ).toBeVisible();

    const ok = await page.request.get(`/api/receipts/${e.receipt_file_id}`);
    expect(ok.status()).toBe(200);
    // no session at all
    expect(
      (
        await request.get(`/api/receipts/${e.receipt_file_id}`, { maxRedirects: 0 })
      ).status(),
    ).not.toBe(200);
    // signed in but not a member
    await signInAsPerson(page, g.people.Out!);
    const denied = await page.request.get(`/api/receipts/${e.receipt_file_id}`);
    expect(denied.status()).not.toBe(200);
  });

  test("a non-image file posing as a receipt is rejected and nothing is created", async ({
    page,
  }) => {
    const g = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
    await signInAsPerson(page, g.people.Ann!);
    await fillExpenseForm(page, g, "Ann", {
      description: `badfile ${Date.now()}`,
      amount: "3.00",
      receipt: {
        name: "evil.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("<script>alert(1)</script>"),
      },
    });
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(page.locator("p[role=alert]").first()).toBeVisible();
    const rows = await query("SELECT 1 FROM expenses WHERE household_id=$1", [g.id]);
    expect(rows.length).toBe(0);
  });
});
