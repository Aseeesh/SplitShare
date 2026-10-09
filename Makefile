# SplitHome developer workflow — `make help` lists everything.
#
# Two entry points:
#   make fresh   brand-new clone → running app (WIPES the database first)
#   make run     daily driver: deps → safe migrations → seed → dev server
#
# The database comes from .env (DATABASE_URL / DIRECT_URL), exactly like the
# app reads it at runtime — there is no second source of connection strings.
# Deployment goes to Cloudflare Workers (OpenNext + wrangler).

# — defaults ------------------------------------------------------------------

PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install env env-check generate \
        db-migrate db-status db-reset db-seed db-setup \
        run fresh dev build start \
        check lint typecheck test test-watch test-e2e coverage \
        studio deploy deploy-preview cf-typegen format clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

# — bootstrap -------------------------------------------------------------------

install: ## Install dependencies (pnpm)
	$(PNPM) install

env: ## Create .env from .env.example if it does not exist
	@if [ ! -f .env ]; then cp .env.example .env; \
		echo "Created .env from .env.example — fill in DATABASE_URL (and the rest)"; \
	else echo ".env already exists — left alone"; fi

env-check: env ## Fail unless .env has a usable DATABASE_URL
	@test -f .env || (echo "Missing .env — run 'make env'"; exit 1)
	@if ! grep -qE '^DATABASE_URL="[^"]+"' .env; then \
		echo "DATABASE_URL is missing or empty in .env — edit it and retry"; exit 1; fi

generate: ## Regenerate the Prisma client (needed after schema changes)
	$(PNPM) prisma:generate

# — database --------------------------------------------------------------------

db-migrate: env-check generate ## Apply committed migrations (safe — never drops data)
	$(PNPM) prisma:deploy

db-status: env-check ## Show applied vs pending migrations
	$(PNPM) exec prisma migrate status --config ./prisma7.config.ts

db-seed: env-check generate ## Idempotent dev seed (the §12 Ann/Bob/Cal fixture)
	$(PNPM) db:seed

db-reset: env-check generate ## DESTRUCTIVE: drop schema, replay migrations, reseed
	@echo "!! Resetting the database at DATABASE_URL — the seed refuses production URLs"
	$(PNPM) db:reset
# Prisma 7: migrate reset no longer auto-runs the seed — do it explicitly.
	$(PNPM) db:seed

db-setup: db-migrate db-seed ## Fresh-but-safe DB: migrate + seed, nothing dropped

# — running ----------------------------------------------------------------------

dev: env-check generate ## Start the dev server
	$(PNPM) dev

run: install env-check db-setup ## Non-destructive local run: deps → migrate → seed → dev
	$(PNPM) dev

fresh: install env-check db-reset ## Fresh clone → running app: deps → WIPE db → migrate → seed → dev
	$(PNPM) dev

build: env-check generate ## Production build
	$(PNPM) build

start: build ## Run the production build locally
	$(PNPM) start

# — quality -----------------------------------------------------------------------

lint: ## ESLint
	$(PNPM) lint

typecheck: ## next typegen + tsc --noEmit
	$(PNPM) typecheck

test: ## Unit + integration tests (integration skips without TEST_DATABASE_URL)
	$(PNPM) test

test-watch: ## Vitest in watch mode
	$(PNPM) test:watch

test-e2e: ## Playwright E2E suite
	$(PNPM) test:e2e

coverage: ## Vitest with coverage report
	$(PNPM) test:coverage

check: lint typecheck test ## Every CI gate at once

studio: env-check generate ## Prisma Studio GUI
	$(PNPM) prisma:studio

# — deploy ------------------------------------------------------------------------

deploy: check ## Production deploy to Cloudflare Workers (after all gates pass)
	$(PNPM) cf:deploy

deploy-preview: ## Local Workers-runtime preview (workerd, needs .dev.vars)
	$(PNPM) cf:preview

cf-typegen: ## Regenerate worker-configuration.d.ts from wrangler.jsonc
	$(PNPM) cf:typegen

# — housekeeping -------------------------------------------------------------------

format: ## Prettier write
	$(PNPM) format

clean: ## Remove build artifacts and generated code
	rm -rf .next src/generated/prisma playwright-report test-results coverage
