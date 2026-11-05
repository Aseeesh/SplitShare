import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";
import { hydrated, query } from "./support/helpers";

test.describe("§23 password sign-in", () => {
  test("a signed-in user sets a password, then signs in with it; wrong and suspended are refused", async ({
    page,
    browser,
  }) => {
    const g = await createGroup({ Ann: "ADMIN" });
    const ann = g.people.Ann!;
    const password = `pw-${Date.now()}-long`;

    // Set it from the profile (the only way to get one).
    await signInAsPerson(page, ann);
    await page.goto("/profile");
    const form = page.getByRole("button", { name: "Set password" });
    await hydrated(form);
    await page.getByPlaceholder("New password (10+ characters)").fill(password);
    await page.getByPlaceholder("Repeat new password").fill(password);
    await form.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Password saved" }),
    ).toBeVisible();

    const [stored] = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1`,
      [ann.id],
    );
    expect(stored!.password_hash.startsWith("scrypt$")).toBe(true);
    expect(stored!.password_hash).not.toContain(password);

    // A fresh browser context has no cookies: sign in with email + password.
    const fresh = await browser.newContext({ baseURL: page.url().split("/profile")[0] });
    const p2 = await fresh.newPage();
    await p2.goto("/signin");
    await p2.getByLabel("Email").fill(ann.email.toUpperCase());
    await p2.getByLabel("Password").fill("wrong-password-1");
    await p2.getByRole("button", { name: "Sign in with email" }).click();
    await expect(p2.getByRole("alert")).toContainText("did not match");

    await p2.getByLabel("Email").fill(ann.email);
    await p2.getByLabel("Password").fill(password);
    await p2.getByRole("button", { name: "Sign in with email" }).click();
    await p2.waitForURL((url) => !url.pathname.startsWith("/signin"));
    await p2.goto("/profile");
    await expect(p2.getByRole("heading", { name: "Your profile" })).toBeVisible();
    const sessions = await query(`SELECT 1 FROM sessions WHERE user_id=$1`, [ann.id]);
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    // A suspended account cannot sign in even with the right password.
    await query(`UPDATE users SET disabled_at = now() WHERE id=$1`, [ann.id]);
    const p3 = await (
      await browser.newContext({ baseURL: page.url().split("/profile")[0] })
    ).newPage();
    await p3.goto("/signin");
    await p3.getByLabel("Email").fill(ann.email);
    await p3.getByLabel("Password").fill(password);
    await p3.getByRole("button", { name: "Sign in with email" }).click();
    await expect(p3.getByRole("alert")).toContainText("did not match");
    await fresh.close();
  });

  test("an unknown email gets the same answer as a wrong password", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(`nobody.${Date.now()}@example.test`);
    await page.getByLabel("Password").fill("whatever-password");
    await page.getByRole("button", { name: "Sign in with email" }).click();
    await expect(page.getByRole("alert")).toContainText("did not match");
  });

  test("callbackUrl cannot redirect off-site", async ({ request }) => {
    const res = await request.post("/api/password-login", {
      form: {
        email: "x@example.test",
        password: "nope-nope-nope",
        callbackUrl: "https://evil.test",
      },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).not.toContain("evil.test");
  });
});
