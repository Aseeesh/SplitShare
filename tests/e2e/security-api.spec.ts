import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { createGroup, signInAsPerson } from "./support/fixtures";

/**
 * §20 cron, §21 security: unauthenticated access, public API shapes, security
 * headers, and the "no process.env in client code" rule.
 */

const ZERO = "00000000-0000-0000-0000-000000000000";

test.describe("§21 signed-out access", () => {
  for (const path of [
    "/notifications",
    "/profile",
    "/households",
    `/households/${ZERO}`,
    `/households/${ZERO}/expenses/new`,
    `/households/${ZERO}/members`,
    `/households/${ZERO}/payments`,
    `/households/${ZERO}/history`,
  ]) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto(path);
      await page.waitForURL(/\/signin/);
      await expect(page).toHaveURL(/\/signin/);
    });
  }

  test("receipts and export deny a signed-out caller without leaking", async ({
    request,
  }) => {
    const receipt = await request.get(`/api/receipts/${ZERO}`);
    expect(receipt.status()).toBe(404);
    const exportRes = await request.get(`/api/households/${ZERO}/export`);
    expect(exportRes.status()).toBe(404);
    expect(exportRes.headers()["content-type"] ?? "").not.toContain("text/csv");
  });

  test("/admin looks missing to a signed-out visitor and to a non-super-user", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page.getByText("This page could not be found")).toBeVisible();
    const g = await createGroup({ Ann: "ADMIN" });
    await signInAsPerson(page, g.people.Ann!);
    await page.goto("/admin");
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await expect(page.getByText("Super user console")).toHaveCount(0);
  });
});

test.describe("§26 health and §20 cron", () => {
  test("/api/health reports {ok, sha, db}", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["db", "ok", "sha"]);
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(body.sha === null || typeof body.sha === "string").toBe(true);
    // Never leaks connection strings.
    expect(JSON.stringify(body)).not.toMatch(/postgres(ql)?:\/\//);
  });

  test("/api/cron/reminders is 401 without or with a wrong bearer", async ({
    request,
  }) => {
    expect((await request.get("/api/cron/reminders")).status()).toBe(401);
    const wrong = await request.get("/api/cron/reminders", {
      headers: { authorization: "Bearer definitely-not-the-secret" },
    });
    expect(wrong.status()).toBe(401);
    const basic = await request.get("/api/cron/reminders", {
      headers: { authorization: "Basic abc" },
    });
    expect(basic.status()).toBe(401);
    // Body must not reveal why.
    expect(await wrong.text()).not.toMatch(/CRON_SECRET/);
  });
});

test.describe("§21 headers", () => {
  for (const path of ["/signin", "/api/health", "/"]) {
    test(`${path} carries the hardening headers`, async ({ request }) => {
      const h = (await request.get(path)).headers();
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    });
  }

  test("the service worker is never cached and is CSP-locked", async ({ request }) => {
    const res = await request.get("/sw.js");
    if (res.status() !== 200) test.skip(true, "no /sw.js served in this build");
    const h = res.headers();
    expect(h["cache-control"]).toContain("no-store");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
  });
});

test.describe("§21 no secrets in client code", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  test("process.env appears under src/components and app only as NEXT_PUBLIC_*", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const dir of ["src/components", "app"]) {
      for (const file of walk(join(root, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (line.includes("process.env") && !line.includes("NEXT_PUBLIC")) {
              offenders.push(`${file}:${i + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every 'use client' file avoids server-only modules", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of walk(join(root, "src/components"))) {
      const text = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/.test(text)) continue;
      // `@/lib/auth/permissions` is pure data (no server-only import), so it is allowed.
      const re = /from ["']@\/lib\/(db|auth)\/([\w-]+)["']/g;
      for (const m of text.matchAll(re)) {
        if (!(m[1] === "auth" && m[2] === "permissions"))
          offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no page response contains DATABASE_URL or the auth secret", async ({
    request,
  }) => {
    const html = await (await request.get("/signin")).text();
    expect(html).not.toMatch(/DATABASE_URL|e2e-secret-not-for-production|postgres:\/\//);
  });
});
