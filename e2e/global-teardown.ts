import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs once after the whole Playwright suite: retires the Merge / Remove /
// Regroup, correction, screening, resolution feedback and routing fixtures
// e2e/global-setup.ts inserted (manuscript revision Phase 3, steps 3d–3g;
// Phase 5, step 5a) by
// rejecting every fixture ticket still active (or the Resolved feedback
// ticket) and cancelling its active Work Orders. Nothing is deleted. global-setup does the same
// first, so a run whose teardown never ran is cleaned up by the next one.
//
// cleanup:e2e-admins then retires the throwaway e2e-* staff accounts specs
// create and locks the shared staff demo accounts (IAN-26), so no
// privileged credential used by the run stays valid afterwards.
export default function globalTeardown(): void {
  const cwd = path.resolve(__dirname, "../api");
  for (const script of ["cleanup:e2e-grouping-fixtures", "cleanup:e2e-admins"])
    execFileSync("pnpm", ["run", script], { cwd, stdio: "inherit", shell: true });
}
