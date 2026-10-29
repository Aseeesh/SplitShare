---
name: e2e-testing
description: How to write and run SplitHome Playwright specs (multi-user, phone-first, shared dev server). Use before writing or running any tests/e2e spec.
---

# SplitHome e2e testing

1. **Find the rules first.** `pnpm tsx scripts/testing/rules.ts "<keywords>"` searches
   `.claude/CLAUDE.md` for the sections that govern a module (e.g. `payments confirm`).
   Every spec's `test.describe` title must cite the section, e.g. `§9 payments`.
2. **Server and DB are shared and already running** at `localhost:3100` against
   `E2E_DATABASE_URL=postgresql://postgres:e2e@localhost:5441/splitshare_e2e`.
   Never reseed, never run `seed-cli.ts`, never TRUNCATE, never start another `next dev`,
   never touch any other database.
3. **Isolate with fixtures.** `createGroup({ Ann: "ADMIN", Bob: "MEMBER", Eve: "VIEWER" })` from
   `tests/e2e/support/fixtures.ts` builds fresh users + sessions + group per test;
   `signInAsPerson(page, group.people.Ann)` signs in. Use `query()` from
   `support/helpers.ts` to assert on DB state (cents are strings; compare as numbers).
4. **Per person, per role.** Cover ADMIN, MEMBER, VIEWER, outsider and removed member for every
   action; assert both the UI and the database. Negative paths matter as much as happy ones.
5. **Money is cents.** Assert integer cents in the DB, formatted money in the UI.
6. **Assert after navigation lands** (`waitForURL`, then visible heading) — never assert the
   absence of something straight after a click.
7. **Run**: `E2E_DATABASE_URL=... pnpm exec playwright test <file> --project=phone`.
   Only your own spec file; keep the suite repeatable (unique descriptions via `Date.now()`).
8. **A failing test is a finding, not a nuisance.** Decide whether the app or the test is wrong.
   If the app is wrong, fix it minimally in `src/`/`app/` (obey `.claude/CLAUDE.md` §2) and say so.
   Never weaken an assertion to go green.
