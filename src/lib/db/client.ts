import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient as NodePrismaClient } from "@/generated/prisma-node/client";

/**
 * The Prisma client singleton.
 *
 * Prisma 7 has no query engine binary: a driver adapter is mandatory. This app
 * runs on the Node runtime, so it uses the node-target client
 * (`src/generated/prisma-node`) with `@prisma/adapter-pg` against `DATABASE_URL`.
 *
 * `import "server-only"` (§2.8/§21) makes a client component that reaches for
 * this module fail the build rather than leak the connection string.
 */

function createPrismaClient(): NodePrismaClient {
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

  // A self-hosted Postgres presents a certificate no public CA signed. Pinning
  // it as the only trusted CA keeps full verification (chain and host) rather
  // than falling back to an unverified TLS session. Unset when the
  // server's certificate chains to a public CA.
  const caCertificate = process.env.DATABASE_CA_CERT;

  return new NodePrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(caCertificate ? { ssl: { ca: caCertificate, rejectUnauthorized: true } } : {}),
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
