import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";

/**
 * Sends the app's real emails to a real inbox so a person can read them:
 * invitation, expense created, payment confirmed.
 *
 * Opt-in: LIVE_EMAIL_TO=you@gmail.com, and the server must have mail configured
 * (it is blanked for normal runs, see playwright.config.ts). Every person gets a
 * `+alias` of that address, so everything lands in one inbox and the group tag in
 * the subject says which run it came from. Sends exactly three emails.
 */
const to = process.env.LIVE_EMAIL_TO;

test("invite, expense and payment emails reach a real inbox", async ({
  page,
}, testInfo) => {
  test.skip(!to, "set LIVE_EMAIL_TO to a real mailbox you can check");
  test.skip(testInfo.project.name !== "phone", "sends real email; run once");

  const group = await createGroup(
    { Ann: "ADMIN", Bob: "MEMBER" },
    { emailTo: to!, requireAcceptance: false },
  );
  const ann = group.people.Ann!;
  const bob = group.people.Bob!;

  // 1. Invitation.
  await signInAsPerson(page, ann);
  await page.goto(`/households/${group.id}/members`);
  await page.getByRole("button", { name: "Invite by email" }).click();
  const input = page.getByRole("combobox").or(page.getByRole("textbox")).first();
  await input.fill(to!.replace("@", `+invitee-${group.name.slice(-8)}@`));
  await input.press("Enter");
  await page
    .getByRole("button", { name: /^Invite/ })
    .last()
    .click();
  await expect(page.getByRole("status")).toContainText("Invitation created");

  // 2. Expense created: Bob is emailed that Ann added something.
  await page.goto(`/households/${group.id}/expenses/new`);
  await page.getByPlaceholder("Groceries").fill("Live email groceries");
  await page.getByPlaceholder("59.41").fill("30.00");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.waitForURL(new RegExp(`/households/${group.id}$`));

  // 3. Bob pays Ann 15.00; Ann confirms, and Bob is emailed.
  await signInAsPerson(page, bob);
  await page.goto(`/households/${group.id}/payments`);
  await page.getByLabel("Amount (NZD)").fill("15.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/awaiting|pending/i).first()).toBeVisible();
  await signInAsPerson(page, ann);
  await page.goto(`/households/${group.id}/payments`);
  await page.getByRole("button", { name: "Yes, it arrived" }).click();
  await expect(page.getByRole("button", { name: "Yes, it arrived" })).toHaveCount(0);
  // Mail is sent after the transaction commits; give the SMTP call time to finish.
  await page.waitForTimeout(5_000);
});
