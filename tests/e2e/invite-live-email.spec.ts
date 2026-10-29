import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";

/**
 * Sends a REAL invitation to a disposable inbox (e.g. 10minutemail), so the email
 * path (SMTP/Resend, template, link) is proven end to end. Opt-in: set
 * LIVE_INBOX_EMAIL, and the server must have GMAIL_USER/EMAIL_API_KEY configured.
 * The inbox lives ~10 minutes, so this cannot be part of CI.
 */
const inbox = process.env.LIVE_INBOX_EMAIL;

test("invite by email reaches a real inbox", async ({ page }) => {
  test.skip(!inbox, "set LIVE_INBOX_EMAIL to a disposable address");
  const group = await createGroup({ Ann: "ADMIN", Bob: "MEMBER" });
  await signInAsPerson(page, group.people.Ann!);
  await page.goto(`/households/${group.id}/members`);
  await page.getByRole("button", { name: "Invite by email" }).click();
  const input = page.getByRole("combobox").or(page.getByRole("textbox")).first();
  await input.fill(inbox!);
  await input.press("Enter");
  await page
    .getByRole("button", { name: /^Invite/ })
    .last()
    .click();
  await expect(page.getByRole("status")).toContainText("Invitation created");
});
