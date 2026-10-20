import { prisma } from "@/lib/db/client";

/**
 * Liveness + readiness for the deploy pipeline.
 *
 * Reports which commit is serving, so a release can wait until the new build is
 * actually live before smoke-testing it, and checks the database answers. Public
 * and cheap by design: it exposes a commit SHA and a boolean, nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, sha, db: true });
  } catch {
    return Response.json({ ok: false, sha, db: false }, { status: 503 });
  }
}
