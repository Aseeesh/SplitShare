import { isCronAuthorised } from "@/lib/cron/auth";
import { generateDueRecurringExpenses } from "@/lib/recurring/generate";
import { runReminders } from "@/lib/reminders/run";

/**
 * §20 — the hourly reminders cron, scheduled by vercel.json.
 *
 * Nothing but authentication and a call: the secret check lives in
 * `@/lib/cron/auth` and the work in `@/lib/reminders/run`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result, recurringGenerated] = await Promise.all([
      runReminders(),
      generateDueRecurringExpenses(),
    ]);
    return Response.json({
      ok: true,
      ...result,
      recurringExpensesGenerated: recurringGenerated,
    });
  } catch (error) {
    // Never echo the error back: this endpoint is reachable by anyone who can
    // guess the URL, and a stack trace would describe the schema to them.
    console.error("[cron] run failed", error);
    return Response.json({ error: "Cron run failed" }, { status: 500 });
  }
}
