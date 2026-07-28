import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000", headless: true },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, NODE_OPTIONS: "--use-system-ca" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
