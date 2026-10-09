import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration.
 *
 * This `datasource` is used by the CLI only — `migrate`, `db push`, `studio`.
 * The application never reads it: at runtime `src/lib/db/client.ts` connects
 * through a driver adapter selected by `DATABASE_DRIVER` (the pooled
 * PgBouncer URL on Workers).
 *
 * DDL must not go through a transaction pooler, so the CLI gets `DIRECT_URL`.
 * Prisma 7 removed the `directUrl` field that used to express this; the split
 * is now "config file = direct, driver adapter = pooled". Locally the two URLs
 * are usually the same, hence the fallback.
 *
 * Plain `process.env` (already populated by dotenv above) rather than the
 * throwing `env()` helper: `prisma generate` never touches the database, yet
 * the config is evaluated for every command — including the CI verify job,
 * which deliberately has no database credentials. Anything that actually
 * connects (migrate/studio) is guarded by `make env-check` locally and by
 * real secrets in the deploy job.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://placeholder.invalid:5432/splitshare",
  },
});
