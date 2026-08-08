import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs once before the whole Playwright suite. Provisions the demo accounts
// every admin/citizen spec logs in as (see e2e/test-credentials.ts) so tests
// never depend on a developer having manually run seed commands first.
//
// Both seed scripts are idempotent upserts (ON CONFLICT), so re-running them
// on every test invocation is safe on the shared dev database — they never
// duplicate accounts or touch ticket/report data. cleanup:e2e-admins runs
// first, deleting the throwaway "e2e-*@porac.gov.ph" admin accounts several
// specs create (admin-management, admin-password, admin-activity-log) —
// without it those accumulate unbounded across repeated local runs until
// /admin/admins has enough rows to blow past test timeouts (see
// api/scripts/seed/cleanup-e2e-admins.ts).
export default function globalSetup(): void {
  const apiDir = path.resolve(__dirname, "../api");
  const run = (script: string) => execFileSync("pnpm", ["run", script], { cwd: apiDir, stdio: "inherit", shell: true });

  try {
    run("cleanup:e2e-admins");
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
