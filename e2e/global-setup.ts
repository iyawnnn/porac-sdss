import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs once before the whole Playwright suite. Provisions the demo accounts
// every admin/citizen spec logs in as (see e2e/test-credentials.ts) so tests
// never depend on a developer having manually run seed commands first.
//
// Both underlying scripts are idempotent upserts (ON CONFLICT), so re-running
// this on every test invocation is safe on the shared dev database — it never
// duplicates accounts or touches ticket/report data.
export default function globalSetup(): void {
  const apiDir = path.resolve(__dirname, "../api");
  const run = (script: string) => execFileSync("pnpm", ["run", script], { cwd: apiDir, stdio: "inherit", shell: true });

  try {
    run("seed:e2e-admins");
    run("seed:users");
  } catch (err) {
    throw new Error(
      "[e2e/global-setup] Failed to provision demo accounts before running Playwright. " +
        "This usually means api/.env is missing/misconfigured or the database hasn't been " +
        "migrated yet — see README.md section D (Database Migrations & Seeding) and run " +
        "`pnpm --prefix api migrate` first. Original error below.",
      { cause: err }
    );
  }
}
