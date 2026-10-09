import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient as EdgePrismaClient } from "@/generated/prisma/client";
import { PrismaClient as NodePrismaClient } from "@/generated/prisma-node/client";

/**
 * The Prisma client singleton.
 *
 * Prisma 7 has no query engine binary: a driver adapter is mandatory, and the
 * generated client's `runtime` shapes which WASM compiler it can load. The
 * two are selected together by `DATABASE_DRIVER`:
 *
 * - `neon` (set in wrangler.jsonc vars) — Cloudflare Workers: the
 *   workerd-target client (`src/generated/prisma`) plus `@prisma/adapter-neon`
 *   over the Neon serverless WebSocket pool. WS is the only Neon driver mode
 *   that supports interactive transactions, which §10's audit-in-the-same-
 *   transaction pattern needs. `DATABASE_URL` is the pooled URL there.
 * - anything else (next dev, tests) — the node-target client
 *   (`src/generated/prisma-node`) plus `@prisma/adapter-pg` against
 *   `DATABASE_URL` in `.env`.
 *
 * Both clients are imported statically so `prisma` stays a sync export, but
 * only the selected one is ever constructed — the other runtime's WASM is
 * never loaded (the wasm-compiler-edge cannot load under Node, and vice
 * versa, so mixing them is a hard crash, not a slow path).
 *
 * `import "server-only"` (§2.8/§21) makes a client component that reaches for
 * this module fail the build rather than leak the connection string.
 */

function createPrismaClient(): NodePrismaClient | EdgePrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; the database client cannot be created");
  }

  // Literal arrays (not a ternary `as const`, which TS forbids) so the values
  // stay assignable to both clients' LogLevel unions; the spread keeps the
  // arrays mutable, which is what the constructors' `log` option expects.
  const developmentLog = ["warn", "error"] as const;
  const productionLog = ["error"] as const;
  const log = [
    ...(process.env.NODE_ENV === "development" ? developmentLog : productionLog),
  ];

  if (process.env.DATABASE_DRIVER === "neon") {
    return new EdgePrismaClient({
      // PrismaNeon takes a PoolConfig and owns the pool itself.
      adapter: new PrismaNeon({
        connectionString,
        max: Number(process.env.DATABASE_POOL_MAX ?? 3),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }),
      log,
    });
  }

  return new NodePrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
    log,
  });
}

// `next dev` re-evaluates modules on every edit; without this the pool would
// grow one client per hot reload until Postgres refused new connections. On
// Workers each isolate gets its own module graph, so the same pattern safely
// yields one small pool per isolate.
const globalForPrisma = globalThis as unknown as { prisma?: NodePrismaClient };

// Statically typed as the node client: the two generated clients share one
// schema and are structurally identical, but a union type would break TS
// overload resolution on generic methods like `$transaction`. The runtime
// selection happens inside createPrismaClient above.
export const prisma: NodePrismaClient = (globalForPrisma.prisma ??
  createPrismaClient()) as NodePrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
