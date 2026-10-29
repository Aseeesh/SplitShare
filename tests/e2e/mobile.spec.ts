import { expect, test, type Page } from "@playwright/test";

import { SESSION_TOKENS } from "./tokens";

/**
 * Every signed-in screen at phone size: it renders, nothing scrolls sideways,
 * and the fixed bottom bar does not cover the last piece of content. Screenshots
 * go to test-results/screens for a human to look at.
 */

async function signInAs(page: Page, who: keyof typeof SESSION_TOKENS) {
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: SESSION_TOKENS[who],
      url: "http://localhost:3100",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function householdId(page: Page, name: string): Promise<string> {
  await page.goto("/households");
  const link = page.getByRole("link", { name: new RegExp(name) }).first();
  const href = await link.getAttribute("href");
  return href!.split("/").pop()!;
}

async function checkScreen(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200); // let entrance animations settle
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label}: horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(
    1,
  );

  // Scroll to the bottom: the last content must sit above the fixed tab bar.
  const clearance = await page.evaluate(() => {
    // Instant, not smooth: the page sets scroll-behavior: smooth, so a long page
    // would still be mid-scroll when measured.
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    const nav = document.querySelector("nav[aria-label]:not([aria-label='App'] ~ *)");
    const bars = [...document.querySelectorAll("nav")].filter(
      (n) => getComputedStyle(n).position === "fixed",
    );
    const bar = bars[0] ?? nav;
    if (!bar) return 999;
    const barTop = bar.getBoundingClientRect().top;
    const main = document.querySelector("main");
    const last = main?.lastElementChild?.getBoundingClientRect().bottom ?? 0;
    return barTop - last;
  });
  expect(
    clearance,
    `${label}: last content is hidden under the tab bar`,
  ).toBeGreaterThanOrEqual(-1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/screens/${test.info().project.name}-${label}.png`,
    fullPage: false,
  });
}

test.describe("phone screens (super user)", () => {
  test.beforeEach(async ({ page }) => signInAs(page, "Ann"));

  test("overview", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Hi Ann")).toBeVisible();
    await checkScreen(page, "overview");
  });

  test("groups", async ({ page }) => {
    await page.goto("/households");
    await expect(page.getByText("Flat 3")).toBeVisible();
    await checkScreen(page, "groups");
  });

  test("household screens", async ({ page }) => {
    const id = await householdId(page, "Flat 3");
    for (const [path, label] of [
      ["", "household-home"],
      ["/history", "history"],
      ["/payments", "payments"],
      ["/members", "members"],
      ["/expenses/new", "new-expense"],
    ] as const) {
      await page.goto(`/households/${id}${path}`);
      await checkScreen(page, label);
    }
  });

  test("notifications", async ({ page }) => {
    await page.goto("/");
    // The bell shows Ann's unread notifications. The exact number depends on what
    // other specs have done to the shared database, so only its presence matters.
    const bell = page.getByRole("link", { name: /\d+ unread notifications/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText("Bob added Movie night")).toBeVisible();
    await checkScreen(page, "notifications");
  });

  test("profile and console", async ({ page }) => {
    await page.goto("/profile");
    await checkScreen(page, "profile");
    await page.goto("/admin");
    await expect(page.getByText("Super user console")).toBeVisible();
    await checkScreen(page, "admin");
  });
});

test("a member never reaches the console", async ({ page }) => {
  await signInAs(page, "Bob");
  await page.goto("/admin");
  // The loading skeleton streams first, so the status is already 200 by the time
  // notFound() runs; what matters is that nothing from the console is rendered.
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await expect(page.getByText("Super user console")).toHaveCount(0);
  await expect(page.getByText("Platform limits")).toHaveCount(0);
});
