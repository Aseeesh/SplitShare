import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const db = process.env.E2E_DATABASE_URL ?? "";

/**
 * Phone-first: every project is a phone viewport, because that is the product.
 * The server runs against E2E_DATABASE_URL, a throwaway database seeded by
 * tests/e2e/seed-cli.ts (run first by `pnpm test:e2e`), and tests sign in with a database session cookie, not Google.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    {
      name: "small-phone",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 640 } },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: db,
      DIRECT_URL: db,
      AUTH_SECRET: "e2e-secret-not-for-production",
      AUTH_TRUST_HOST: "true",
      AUTH_URL: `http://localhost:${PORT}`,
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
