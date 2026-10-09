// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No R2. This app renders dynamically (no ISR / `unstable_cache`), so the
// default "dummy" incremental cache is used and no R2 bucket is provisioned.
export default defineCloudflareConfig({});
