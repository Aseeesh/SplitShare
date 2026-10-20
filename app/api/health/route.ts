import { checkHealth } from "@/lib/health";

/**
 * Liveness + readiness for the deploy pipeline.
 *
 * Reports which commit is serving, so a release can wait until the new build is
 * actually live before smoke-testing it. Public and cheap by design: it exposes
 * a commit SHA and two booleans, nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const report = await checkHealth();
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
