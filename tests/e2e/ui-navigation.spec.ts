import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { can, type Capability } from "../../src/lib/auth/permissions";
import {
  createGroup,
  signInAsPerson,
  type FixtureGroup,
  type FixturePerson,
} from "./support/fixtures";
import { query } from "./support/helpers";

/**
 * §13 / §27 UI, phone UX and navigation.
 *
 * Born from a reported 404 while adding an expense. The generic rule: whatever
 * page a person is on, no link the app shows them may lead to a 404 or a 500,
 * and nothing that mutates is offered to a role the §5 matrix (permissions.ts)
 * does not allow.
 */

const NOT_FOUND = "This page could not be found";
const MONEY = /\$\d{1,3}(,\d{3})*\.\d{2}/;

interface Seeded {
  group: FixtureGroup;
  pending: string; // Ann paid, Ann/Bob/Eve split, PENDING_ACCEPTANCE
  paid: string; // Ann paid, PAID (lockable)
  bobs: string; // Bob created + paid, PAID
}

async function insertExpense(
  group: FixtureGroup,
  opts: {
    creator: string;
    description: string;
    cents: number;
    status: "PENDING_ACCEPTANCE" | "PAID";
    splits: Array<{ who: string; cents: number; accepted: boolean }>;
  },
): Promise<string> {
  const id = randomUUID();
  const payer = group.people[opts.creator]!.id;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO expenses (id, household_id, paid_by_user_id, created_by_user_id, description,
         amount_cents, currency, date, split_method, status, updated_at)
       VALUES ($1,$2,$3,$3,$4,$5,'NZD',current_date,'EXACT',$6::"ExpenseStatus",now())`,
      [id, group.id, payer, opts.description, opts.cents, opts.status],
    );
    await client.query(
      `INSERT INTO expense_funders (id, expense_id, user_id, amount_cents) VALUES ($1,$2,$3,$4)`,
      [randomUUID(), id, payer, opts.cents],
    );
    for (const s of opts.splits) {
      await client.query(
        `INSERT INTO expense_splits (id, expense_id, user_id, amount_cents, acceptance, accepted_at, settled_at)
         VALUES ($1,$2,$3,$4,$5::"AcceptanceStatus",$6,$7)`,
        [
          randomUUID(),
          id,
          group.people[s.who]!.id,
          s.cents,
          s.accepted ? "ACCEPTED" : "PENDING",
          s.accepted ? new Date() : null,
          opts.status === "PAID" ? new Date() : null,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
  return id;
}

async function seedGroup(): Promise<Seeded> {
  const group = await createGroup({
    Ann: "ADMIN",
    Bob: "MEMBER",
    Eve: "VIEWER",
    Rem: "MEMBER",
  });
  const tag = Date.now();
  const pending = await insertExpense(group, {
    creator: "Ann",
    description: `UI pending ${tag}`,
    cents: 9000,
    status: "PENDING_ACCEPTANCE",
    splits: [
      { who: "Ann", cents: 3000, accepted: true },
      { who: "Bob", cents: 3000, accepted: false },
      { who: "Eve", cents: 3000, accepted: false },
    ],
  });
  const paid = await insertExpense(group, {
    creator: "Ann",
    description: `UI paid ${tag}`,
    cents: 4000,
    status: "PAID",
    splits: [
      { who: "Ann", cents: 2000, accepted: true },
      { who: "Bob", cents: 2000, accepted: true },
    ],
  });
  const bobs = await insertExpense(group, {
    creator: "Bob",
    description: `UI bobs ${tag}`,
    cents: 2500,
    status: "PAID",
    splits: [
      { who: "Ann", cents: 1250, accepted: true },
      { who: "Bob", cents: 1250, accepted: true },
    ],
  });
  // Rem leaves: removed members keep their user row but lose membership.
  await query(
    `UPDATE household_members SET removed_at = now() WHERE household_id = $1 AND user_id = $2`,
    [group.id, group.people.Rem!.id],
  );
  return { group, pending, paid, bobs };
}

interface Visit {
  status: number;
  notFound: boolean;
  hrefs: string[];
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Dev-server infrastructure (HMR socket, a restart mid-run) is not an app error.
    if (
      /_next\/hmr|ERR_CONNECTION_REFUSED|net::ERR_FAILED/.test(
        m.text() + m.location().url,
      )
    )
      return;
    if (m.type() === "error") errors.push(`console: ${m.text()} @ ${m.location().url}`);
  });
  return errors;
}

async function visit(page: Page, path: string): Promise<Visit> {
  const response = await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const body = (await page.locator("body").innerText()).slice(0, 4000);
  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => a.getAttribute("href") ?? ""),
  );
  return {
    status: response?.status() ?? 0,
    notFound: body.includes(NOT_FOUND),
    hrefs,
  };
}

function internal(hrefs: string[]): string[] {
  const out = new Set<string>();
  for (const h of hrefs) {
    if (!h.startsWith("/") || h.startsWith("//")) continue;
    if (h.startsWith("/api/")) continue; // sign-out and friends are POST-driven
    out.add(h.split("#")[0]!);
  }
  return [...out].filter(Boolean);
}

type Kind = "ADMIN" | "MEMBER" | "VIEWER" | "outsider" | "removed" | "superNonMember";

async function personFor(kind: Kind, s: Seeded): Promise<FixturePerson> {
  switch (kind) {
    case "ADMIN":
      return s.group.people.Ann!;
    case "MEMBER":
      return s.group.people.Bob!;
    case "VIEWER":
      return s.group.people.Eve!;
    case "removed":
      return s.group.people.Rem!;
    case "outsider": {
      const other = await createGroup({ Out: "ADMIN" });
      return other.people.Out!;
    }
    case "superNonMember": {
      const other = await createGroup({ Sue: "ADMIN" });
      await query(`UPDATE users SET is_super_user = true WHERE id = $1`, [
        other.people.Sue!.id,
      ]);
      return other.people.Sue!;
    }
  }
}

const KINDS: Kind[] = [
  "ADMIN",
  "MEMBER",
  "VIEWER",
  "outsider",
  "removed",
  "superNonMember",
];

test.describe("§13 §27 navigation: no dead links for any kind of person", () => {
  for (const kind of KINDS) {
    test(`${kind}: every reachable link lands on a real page`, async ({ page }) => {
      test.setTimeout(360_000);
      const s = await seedGroup();
      const person = await personFor(kind, s);
      await signInAsPerson(page, person);
      const errors = watchErrors(page);
      const g = `/households/${s.group.id}`;
      const member = kind === "ADMIN" || kind === "MEMBER" || kind === "VIEWER";
      const seeds = [
        "/",
        "/households",
        "/notifications",
        "/profile",
        g,
        `${g}/history`,
        `${g}/payments`,
        `${g}/members`,
        `${g}/expenses/new`,
        `${g}/expenses/${s.pending}`,
        `${g}/expenses/${s.paid}`,
      ];
      const problems: string[] = [];
      const seen = new Set<string>();
      const queue: Array<{ path: string; from: string | null }> = seeds.map((p) => ({
        path: p,
        from: null,
      }));
      while (queue.length > 0 && seen.size < 70) {
        const { path, from } = queue.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);
        const v = await visit(page, path);
        const dead = v.notFound || v.status === 404;
        if (v.status >= 500)
          problems.push(`500-class ${v.status}: ${path} (from ${from})`);
        if (from !== null && (dead || v.status >= 400)) {
          problems.push(`dead link ${path} -> ${v.status} (found on ${from})`);
        }
        if (from === null) {
          // Seeds: a member may not 404 anywhere except the add form as VIEWER.
          const mayAdd = kind === "ADMIN" || kind === "MEMBER";
          const expectDead =
            (path.startsWith(g) && !member && kind !== "superNonMember") ||
            (path === `${g}/expenses/new` && !mayAdd);
          if (dead && !expectDead && !(kind === "superNonMember" && path.startsWith(g))) {
            problems.push(`unexpected 404 on seed ${path}`);
          }
          if (!dead && expectDead && kind !== "VIEWER") {
            problems.push(`seed ${path} should be hidden from ${kind} but rendered`);
          }
          if (path === `${g}/expenses/new` && kind === "VIEWER" && !dead) {
            problems.push("VIEWER reached the add-expense form");
          }
        }
        if (!dead) {
          for (const h of internal(v.hrefs)) {
            if (!seen.has(h)) queue.push({ path: h, from: path });
          }
        }
      }
      expect(problems, problems.join("\n")).toEqual([]);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("§13 §27 navigation: clickable controls", () => {
  test("tab bar, FAB and header links all navigate to real pages", async ({ page }) => {
    test.setTimeout(240_000);
    const s = await seedGroup();
    await signInAsPerson(page, s.group.people.Ann!);
    const errors = watchErrors(page);
    const g = `/households/${s.group.id}`;

    // Global tabs.
    await page.goto("/");
    for (const label of ["Groups", "Profile", "Overview"]) {
      await page
        .getByRole("navigation")
        .getByRole("link", { name: label })
        .first()
        .click();
      await page.waitForLoadState("load");
      await expect(page.locator("body")).not.toContainText(NOT_FOUND);
    }

    // Household tabs.
    await page.goto(g);
    for (const label of ["History", "Payments", "Members", "Home"]) {
      await page
        .getByRole("navigation")
        .getByRole("link", { name: label })
        .first()
        .click();
      await page.waitForLoadState("load");
      await expect(page.locator("body")).not.toContainText(NOT_FOUND);
    }

    // FAB.
    await page.goto(g);
    await page.locator(`a[href="${g}/expenses/new"]`).first().click();
    await page.waitForURL(`**${g}/expenses/new`);
    await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();

    // Expense row -> detail.
    await page.goto(g);
    await page.locator(`a[href="${g}/expenses/${s.paid}"]`).first().click();
    await page.waitForURL(`**${g}/expenses/${s.paid}`);
    await expect(page.locator("body")).not.toContainText(NOT_FOUND);

    // Notification bell.
    await page.goto("/");
    await page.locator('a[href="/notifications"]').first().click();
    await page.waitForURL("**/notifications");
    await expect(page.locator("body")).not.toContainText(NOT_FOUND);

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("switch-group sheet opens and every group in it is reachable", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const s = await seedGroup();
    const other = await createGroup({ Zed: "ADMIN" });
    await query(
      `INSERT INTO household_members (id, household_id, user_id, role) VALUES ($1,$2,$3,'MEMBER')`,
      [randomUUID(), other.id, s.group.people.Ann!.id],
    );
    await signInAsPerson(page, s.group.people.Ann!);
    const errors = watchErrors(page);
    await page.goto(`/households/${s.group.id}`);
    await page
      .getByRole("button", { name: new RegExp(s.group.name) })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(other.name)).toBeVisible();
    await dialog.getByText(other.name).click();
    await page.waitForURL(`**/households/${other.id}`);
    await expect(page.locator("body")).not.toContainText(NOT_FOUND);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("§5 controls are shown only to roles that may use them", () => {
  const people: Array<{
    name: "Ann" | "Bob" | "Eve";
    role: "ADMIN" | "MEMBER" | "VIEWER";
  }> = [
    { name: "Ann", role: "ADMIN" },
    { name: "Bob", role: "MEMBER" },
    { name: "Eve", role: "VIEWER" },
  ];

  for (const { name, role } of people) {
    test(`${role} sees exactly the mutating controls the matrix allows`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const s = await seedGroup();
      const me = s.group.people[name]!;
      await signInAsPerson(page, me);
      const g = `/households/${s.group.id}`;
      const cap = (c: Capability) => can(role, c);

      // Add expense control.
      await page.goto(g);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expect(page.locator(`a[href="${g}/expenses/new"]`)).toHaveCount(
        cap("CREATE_EXPENSE")
          ? await page.locator(`a[href="${g}/expenses/new"]`).count()
          : 0,
      );
      if (cap("CREATE_EXPENSE")) {
        expect(await page.locator(`a[href="${g}/expenses/new"]`).count()).toBeGreaterThan(
          0,
        );
      }

      // Accept / Reject a split: only people allowed to, and only with a pending split.
      const hasPending = name === "Bob" || name === "Eve";
      const acceptButtons = page.getByRole("button", { name: /^Accept$/ });
      if (hasPending && cap("ACCEPT_OWN_SPLIT")) {
        await expect(acceptButtons.first()).toBeVisible();
      } else {
        await expect(acceptButtons).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Reject$/ })).toHaveCount(0);
      }

      // Expense detail on a PAID expense Ann created, then one Bob created.
      for (const [expense, creator] of [
        [s.paid, "Ann"],
        [s.bobs, "Bob"],
      ] as const) {
        await page.goto(`${g}/expenses/${expense}`);
        await expect(page.locator("body")).not.toContainText(NOT_FOUND);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const own = creator === name;
        const wantDelete = cap(own ? "DELETE_OWN_EXPENSE" : "DELETE_ANY_EXPENSE");
        const wantEdit = cap(own ? "EDIT_OWN_EXPENSE" : "EDIT_ANY_EXPENSE");
        const wantLock = cap("LOCK_EXPENSE");
        const label = `${name} on ${creator}'s expense`;
        await expect(
          page.getByRole("button", { name: /^Delete$/ }),
          `${label}: Delete`,
        ).toHaveCount(wantDelete ? 1 : 0);
        await expect(
          page.getByRole("link", { name: /^Edit$/ }),
          `${label}: Edit`,
        ).toHaveCount(wantEdit ? 1 : 0);
        await expect(
          page.getByRole("button", { name: /^Lock$/ }),
          `${label}: Lock`,
        ).toHaveCount(wantLock ? 1 : 0);
      }

      // Payments: record / confirm.
      await page.goto(`${g}/payments`);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(
        cap("RECORD_OWN_PAYMENT") ? 1 : 0,
      );

      // Members: invite and remove.
      await page.goto(`${g}/members`);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expect(page.getByRole("button", { name: /^Invite/ })).toHaveCount(
        cap("MANAGE_MEMBERS") ? 1 : 0,
      );
      expect((await page.getByRole("button", { name: /^Remove$/ }).count()) > 0).toBe(
        cap("MANAGE_MEMBERS"),
      );
      expect(
        (await page.getByRole("button", { name: /Deactivate household/ }).count()) > 0,
      ).toBe(cap("ARCHIVE_HOUSEHOLD"));
    });
  }
});

test.describe("§27 phone UX", () => {
  async function overflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  }

  test("no horizontal scroll on any page; money is $ with two decimals", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const s = await seedGroup();
    await signInAsPerson(page, s.group.people.Ann!);
    const g = `/households/${s.group.id}`;
    const pages = [
      "/",
      "/households",
      "/notifications",
      "/profile",
      g,
      `${g}/history`,
      `${g}/payments`,
      `${g}/members`,
      `${g}/expenses/new`,
      `${g}/expenses/${s.pending}`,
      "/offline",
    ];
    const bad: string[] = [];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(800); // entrance animations
      const o = await overflow(page);
      if (o > 1) bad.push(`${p}: ${o}px horizontal overflow`);
    }
    expect(bad, bad.join("\n")).toEqual([]);

    await page.goto(g);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const text = await page.locator("body").innerText();
    expect(text, "money rendered through formatMoney").toMatch(MONEY);
    expect(text, "no raw cents").not.toMatch(/(^|\s)9000(\s|$)/);
    await page.goto(`${g}/expenses/${s.pending}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(await page.locator("body").innerText()).toMatch(/\$90\.00/);
  });

  test("tab bar is visible and clears the FAB and the submit button", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const s = await seedGroup();
    await signInAsPerson(page, s.group.people.Ann!);
    const g = `/households/${s.group.id}`;

    const barRect = async () =>
      page.evaluate(() => {
        const bars = [...document.querySelectorAll("nav")].filter(
          (n) =>
            getComputedStyle(n).position === "fixed" &&
            n.getBoundingClientRect().height > 0,
        );
        const r = bars.at(-1)?.getBoundingClientRect();
        return r
          ? { top: r.top, bottom: r.bottom, height: r.height, vh: window.innerHeight }
          : null;
      });

    await page.goto(g);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1200); // FAB springs in
    const bar = await barRect();
    expect(bar, "bottom tab bar exists").not.toBeNull();
    expect(bar!.bottom).toBeLessThanOrEqual(bar!.vh + 1);
    expect(bar!.top).toBeGreaterThan(bar!.vh / 2);
    const fab = await page.locator(`a[href="${g}/expenses/new"]`).evaluateAll((els) => {
      const el = els.find((e) => getComputedStyle(e.parentElement!).position === "fixed");
      const r = el?.getBoundingClientRect();
      return r ? { y: r.y, height: r.height } : null;
    });
    expect(fab, "FAB visible").not.toBeNull();
    expect(fab!.y + fab!.height, "FAB sits above the tab bar").toBeLessThanOrEqual(
      bar!.top + 1,
    );

    // Submit button on the expense form is never hidden behind the bar.
    await page.goto(`${g}/expenses/new`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const submit = page.getByRole("button", { name: "Add expense" });
    await submit.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const box = await submit.boundingBox();
    const bar2 = await barRect();
    expect(box).not.toBeNull();
    if (bar2) {
      expect(box!.y + box!.height, "submit clears the tab bar").toBeLessThanOrEqual(
        bar2.top + 1,
      );
    }
    const topmost = await submit.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(topmost, "submit is the topmost element at its centre").toBe(true);
  });

  test("signed-out sign-in is a bottom sheet", async ({ page, viewport }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page
      .getByRole("button", { name: /sign in|get started|continue/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /google/i })).toBeVisible();
    await page.waitForTimeout(800); // spring settles
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(
      Math.abs(box!.y + box!.height - viewport!.height),
      "anchored to bottom",
    ).toBeLessThan(4);
    expect(box!.width).toBeGreaterThanOrEqual(viewport!.width - 2);
  });

  test("offline page is static and readable", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto("/offline");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
