import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs once after the whole Playwright suite: retires the Merge / Remove /
// Regroup and correction fixtures e2e/global-setup.ts inserted (manuscript
// revision Phase 3, steps 3d and 3e) by rejecting every fixture ticket still active and cancelling
// its active Work Orders. Nothing is deleted. global-setup does the same
// first, so a run whose teardown never ran is cleaned up by the next one.
export default function globalTeardown(): void {
  execFileSync("pnpm", ["run", "cleanup:e2e-grouping-fixtures"], {
    cwd: path.resolve(__dirname, "../api"),
    stdio: "inherit",
    shell: true,
  });
}
