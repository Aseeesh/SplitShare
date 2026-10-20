# SplitHome

Household expense sharing on Next.js, PostgreSQL and Vercel. Built for a small
co-habiting group rather than a general-purpose ledger: a few people, one
household, shared bills.

A mobile-first installable PWA. Anyone can register with Google and create a
household, becoming its admin; admins invite people (or track someone who will
never sign up), everyone splits expenses, and balances settle themselves.

## What makes it different from a spreadsheet

- **Money is never a float.** Every amount is an integer number of cents in a
  Postgres `BIGINT`. The only place a float appears is the final division for
  display.
- **Financial facts are append-only.** Payments and audit rows cannot be updated
  or deleted — enforced by database triggers, not only by application code. A
  correction is a new reversing row, so history is never rewritten.
- **Balances are derived, never stored.** They come from a SQL view over the
  expenses, splits and confirmed payments, so they cannot drift out of sync.
- **Splits are agreed, not imposed.** Each participant accepts or rejects their
  own share, and the expense tracks that as a state machine.
- **The server owns the arithmetic.** The split UI is a suggestion; every
  per-person amount is recomputed server-side from validated input.

## Who can do what

- **Anyone** who signs in can create households (20 each by default) and becomes
  the admin of the ones they create. Email addresses are unique, case-insensitively.
- **Admins** add up to 10 members per household (invite by email, or track a
  placeholder), remove people, change roles, deactivate the household, and see
  suggestions of people they have shared other households with.
- **Members** create expenses, accept or reject their own share, record and
  confirm payments, correct their own expenses, and may leave a household.
- **Super users** (listed in `SUPERUSER_EMAILS`, or promoted with the ops CLI)
  see and manage every household and user from `/admin`: suspend accounts and
  households, change the limits globally or per admin/household, and edit the
  role matrix. Every such change is written to an append-only platform audit log.

A deactivated household is hidden from its members and read-only; its admin can
restore it for 30 days, after which it is permanently deleted.

## Money across expenses

Each person has one net balance, and the settle-up plan uses the fewest transfers.
Between two people, the **pairwise ledger** shows who owes whom across all
expenses; when each owes the other, one tap proposes cancelling the overlap and
the other person accepts. Payments are applied to the payer's oldest unpaid
shares (recorded in `payment_allocations`), so expenses reach PAID on their own.
Editing or deleting an expense is a reversal plus a replacement, in one transaction.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
Prisma 7 with the `pg` driver adapter · PostgreSQL 16 (self-hosted in production; Neon-compatible) ·
Auth.js v5 · Zod 4 · Vitest · Playwright

## Architecture

| Piece | Choice |
|---|---|
| App | Vercel, functions pinned to Singapore (`sin1`) |
| Database | Postgres 16 in Docker on a VPS in Jakarta, TLS with a pinned certificate (`DATABASE_CA_CERT`) |
| Deploys | GitHub Actions: gates → migrate → deploy → wait for `/api/health` → smoke |
| Scheduled jobs | GitHub Actions (hourly purge + reminders) through the Python ops CLI |

Host and database are swappable by configuration; keep the function region next to
the database, since query round-trips dominate page load time.

## Getting started

Requires Node 24 and pnpm 12.

```bash
pnpm install
cp .env.example .env          # then fill it in
pnpm prisma:generate
pnpm prisma:deploy            # applies migrations, including the triggers and views
pnpm db:seed                  # optional: a household with realistic balances
pnpm dev
```

`.env.example` documents every variable. `DATABASE_URL` is the pooled
connection used at runtime; `DIRECT_URL` is the unpooled one used for DDL,
since migrations must not go through a transaction pooler.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` / `pnpm build` | Run / build the app |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | The CI gate |
| `pnpm test:coverage` | Enforces 100% coverage on the split engine |
| `pnpm test:e2e` | Playwright at phone viewports (needs `E2E_DATABASE_URL`, a throwaway database that is wiped) |
| `pnpm prisma:migrate` · `pnpm prisma:deploy` · `pnpm db:reset` | Schema |
| `pnpm db:seed` | Seed a development household |
| `pnpm format` | Prettier |

## Tests

```bash
pnpm test
```

Unit tests need nothing but Node. The database tests assert the triggers and
views directly and **skip cleanly** when no database is reachable, so a fresh
clone stays green — set `TEST_DATABASE_URL` and apply migrations to it to run
them:

```bash
DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL pnpm prisma:deploy
pnpm test
```

CI runs them against a real Postgres and fails if it sees them skip, so a
broken trigger cannot pass silently.

## Layout

```
app/                 routes only, no business logic
src/lib/             business logic — splits, expenses, auth, audit, money
src/actions/         server actions
src/components/      UI, grouped by feature
prisma/              schema and migrations (the triggers are hand-written SQL)
tests/               vitest; tests/e2e is playwright
scripts/ops/         Python operations CLI (super users, limits, purge, smoke checks)
scripts/deploy/      one script per hosting target
.github/workflows/   CI, deploy, scheduled maintenance
```

`src/lib/db/*` and `src/lib/auth/*` are `server-only`: a client component that
imports them fails the build rather than leaking a connection string.

## Operations (Python)

```bash
python -m venv scripts/ops/.venv && scripts/ops/.venv/bin/pip install -r scripts/ops/requirements.txt
scripts/ops/.venv/bin/python scripts/ops/cli.py status
scripts/ops/.venv/bin/python scripts/ops/cli.py promote you@example.com      # first super user
scripts/ops/.venv/bin/python scripts/ops/cli.py purge --dry-run               # archived > 30 days
scripts/ops/.venv/bin/python scripts/ops/cli.py backfill-allocations          # dry run; --apply to write
```

Reads `DIRECT_URL`/`DATABASE_URL` from the environment, then `.env`. Day-to-day
management happens in the app's `/admin` console; the CLI is for bootstrap and
for scheduled jobs that must not depend on one hosting platform.

## CI/CD

Every push to `main` runs the gates (lint, format, typecheck, unit and database
tests against a real Postgres, Python tests, and the phone-viewport E2E suite),
then applies migrations, deploys, waits until `/api/health` reports the new
commit, and smoke-tests it. The target is chosen by the repo variable
`DEPLOY_TARGET` (`vercel-hook` by default; `vercel` and `cloudflare` also
exist) — see `scripts/README.md` for the one-time setup. A scheduled workflow
runs the 30-day purge and the reminders job, so neither depends on a platform cron.

Required GitHub secrets include `DATABASE_URL`, `DIRECT_URL`, `DATABASE_CA_CERT` (the
database's PEM certificate, when it is self-signed), `CRON_SECRET` (must equal the
value in the host's environment) and `AUTH_SECRET`.

