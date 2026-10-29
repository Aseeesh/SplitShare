import { expect, test } from "@playwright/test";

import { householdIdByName, query, signInAs } from "./support/helpers";

/**
 * "Add an expense" for every kind of person, in every kind of group.
 *
 * Born from a reported 404 when adding an expense: the page answers 404 to
 * anyone who may not create one, so the question is whether the app ever sends
 * such a person there. Every entry point is clicked, not just typed into the URL.
 */

test.describe("who can reach the add-expense form", () => {
  const cases = [
    { who: "Ann", group: "Flat 3", allowed: true },
    { who: "Bob", group: "Flat 3", allowed: true },
    { who: "Cal", group: "Flat 3", allowed: true },
    { who: "Eve", group: "Roles house", allowed: false }, // VIEWER
    { who: "Fay", group: "Flat 3", allowed: false }, // outsider
    { who: "Gus", group: "Roles house", allowed: false }, // removed
    { who: "Bob", group: "Frozen flat", allowed: false }, // archived
  ] as const;

  for (const { who, group, allowed } of cases) {
    test(`${who} in ${group} ${allowed ? "can" : "cannot"}`, async ({ page }) => {
      const id = await householdIdByName(group);
      await signInAs(page, who);
      await page.goto(`/households/${id}/expenses/new`);
      if (allowed) {
        await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
      } else {
        await expect(page.getByText("This page could not be found")).toBeVisible();
      }
    });
  }
});

test.describe("the app never links a person to a page that 404s for them", () => {
  // Every in-app way to reach the form, per person who can see the group.
  const viewers = [
    { who: "Eve", group: "Roles house" },
    { who: "Bob", group: "Frozen flat" },
    { who: "Ann", group: "Flat 3" },
  ] as const;

  for (const { who, group } of viewers) {
    test(`${who} in ${group}: every "add" control leads somewhere real`, async ({
      page,
    }) => {
      const id = await householdIdByName(group);
      await signInAs(page, who);
      await page.goto(`/households/${id}`);
      const href = `/households/${id}/expenses/new`;
      const links = page.locator(`a[href="${href}"]`);
      const total = await links.count();
      // Who sees which controls is the other half of the contract: a person who
      // cannot create an expense must be shown no way to try.
      const mayCreate = who !== "Eve" && group !== "Frozen flat";
      if (!mayCreate) expect(total, "no add control for someone who cannot add").toBe(0);

      for (let i = 0; i < total; i++) {
        await page.goto(`/households/${id}`);
        await links.nth(i).click();
        await page.waitForURL(`**${href}`);
        await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
      }
    });
  }
});

test("Bob adds an expense in Flat 3 and everyone's split is right", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "mutates data; run once");
  const id = await householdIdByName("Flat 3");
  const description = `E2E bread ${Date.now()}`;
  await signInAs(page, "Bob");
  await page.goto(`/households/${id}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill(description);
  await page.getByPlaceholder("59.41").fill("10.00");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL(new RegExp(`/households/${id}$`));

  const splits = await query<{ amount_cents: string }>(
    `SELECT s.amount_cents FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.household_id = $1 AND e.description = $2`,
    [id, description],
  );
  expect(splits.reduce((n, r) => n + Number(r.amount_cents), 0)).toBe(1000);
});
