import "server-only";

import { prisma } from "@/lib/db/client";

/** The commit this build was made from, or null when the host does not say. */
export function buildSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null;
}

export interface HealthReport {
  ok: boolean;
  sha: string | null;
  db: boolean;
}

/** Cheap readiness probe: is a database round-trip possible right now? */
export async function checkHealth(): Promise<HealthReport> {
  const sha = buildSha();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, sha, db: true };
  } catch {
    return { ok: false, sha, db: false };
  }
}
