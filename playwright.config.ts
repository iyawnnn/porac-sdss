import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Provisions demo admin/citizen accounts before any test runs — see
  // e2e/global-setup.ts. Idempotent, so safe on the shared dev database.
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000", headless: true },
  webServer: {
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, NODE_OPTIONS: "--use-system-ca" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});