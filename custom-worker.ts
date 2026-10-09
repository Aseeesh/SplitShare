// Bare specifier on purpose: TypeScript resolves it through the ambient
// declaration in open-next-worker.d.ts (non-relative ambient declarations
// match, relative ones never do), and wrangler maps it to the real file via
// the `alias` entry in wrangler.jsonc at bundle time. A relative import of
// the build artifact cannot be type-checked, because `cf:build` wipes
// .open-next/ before `next build` runs its TS check.
import handler from "opennext-worker";

/**
 * Wrapper around the OpenNext-generated worker.
 *
 * Cloudflare Cron Triggers invoke the worker's `scheduled` handler directly
 * and send no HTTP headers, so the platform path cannot satisfy the
 * constant-time `Authorization: Bearer $CRON_SECRET` check in
 * `src/lib/cron/auth.ts`. Rather than weakening §20, the scheduled handler
 * re-enters the existing HTTP route with the secret attached — same isolate,
 * no network, same audit and idempotency guarantees. If in-process routing
 * ever misbehaves, the fallback is `env.WORKER_SELF_REFERENCE.fetch(...)`
 * with the public URL.
 */
export default {
  fetch: handler.fetch,

  async scheduled(_event, env, ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error("[cron] CRON_SECRET is not set; refusing to run reminders");
      return;
    }
    try {
      const response = await handler.fetch(
        new Request("https://cron.internal/api/cron/reminders", {
          headers: { authorization: `Bearer ${secret}` },
        }),
        env,
        ctx,
      );
      if (!response.ok) {
        console.error(`[cron] reminders run failed with status ${response.status}`);
      }
    } catch (error) {
      console.error("[cron] reminders run threw", error);
    }
  },
} satisfies ExportedHandler<Env>;
