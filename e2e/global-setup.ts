import { execFileSync } from "node:child_process";
import path from "node:path";
import { assertStaffPasswordConfigured } from "./test-credentials";

// Runs once before the whole Playwright suite. Provisions the demo accounts
// every admin/citizen spec logs in as (see e2e/test-credentials.ts) so tests
// never depend on a developer having manually run seed commands first.
//
// Both seed scripts are idempotent upserts (ON CONFLICT), so re-running them
// on every test invocation is safe on the shared dev database — they never
// duplicate demo accounts. cleanup:e2e-admins first deactivates throwaway
// assessment creators and deletes only unreferenced throwaway accounts. The
// assessor FK preserves creators; no audit row is changed or removed.
//
// seed:e2e-grouping-fixtures then inserts the tickets the Merge / Remove /
// Regroup, category / location correction, severity screening and resolution
// feedback specs work on (manuscript revision Phase 3, steps 3d–3g), and the
// manual routing spec's (Phase 5, step 5a), the assessment / Work Order spec's
// (step 5b) and the resolution outcome / return spec's (step 5c), directly,
// without posting a report, and hands their ids to the tests through
// process.env.E2E_GROUPING_FIXTURES; e2e/global-teardown.ts retires them.
export default function globalSetup(): void {
  assertStaffPasswordConfigured();
  const apiDir = path.resolve(__dirname, "../api");
  const run = (script: string) => execFileSync("pnpm", ["run", script], { cwd: apiDir, stdio: "inherit", shell: true });

  try {
    run("cleanup:e2e-admins");
    run("seed:e2e-admins");
    run("seed:users");
    const output = execFileSync("pnpm", ["run", "seed:e2e-grouping-fixtures"], {
      cwd: apiDir,
      stdio: ["ignore", "pipe", "inherit"],
      shell: true,
      encoding: "utf8",
    });
    const line = output.split(/\r?\n/).find((l) => l.startsWith("E2E_GROUPING_FIXTURES="));
    if (!line) throw new Error(`seed:e2e-grouping-fixtures printed no fixture ids:\n${output}`);
    process.env.E2E_GROUPING_FIXTURES = line.slice("E2E_GROUPING_FIXTURES=".length);
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
