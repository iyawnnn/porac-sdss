#!/usr/bin/env node
// Regression test for the "stale build metadata" bug (see CLAUDE.md /
// README: api/scripts/clean-build-cache.js). Reproduces the exact failure
// precondition — dist/ deleted, tsconfig.build.tsbuildinfo left behind —
// and confirms the normal `pnpm build` command self-heals instead of
// silently skipping dist/main.js. No DB/env needed: pure filesystem +
// child_process, cross-platform (Windows/macOS/Linux), no dependency added.
const { execSync } = require("child_process");
const { existsSync, rmSync } = require("fs");
const { join } = require("path");

const apiRoot = join(__dirname, "..", "..");
const distDir = join(apiRoot, "dist");
const distMain = join(distDir, "main.js");
const buildInfo = join(apiRoot, "tsconfig.build.tsbuildinfo");

function run(command) {
  execSync(command, { cwd: apiRoot, stdio: "inherit" });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

console.log("[1/4] Building the API normally...");
run("pnpm run build");
if (!existsSync(distMain)) fail("dist/main.js is missing after the first build.");

console.log("[2/4] Deleting dist/ while leaving tsconfig.build.tsbuildinfo in place...");
rmSync(distDir, { recursive: true, force: true });
if (!existsSync(buildInfo)) {
  fail(
    "tsconfig.build.tsbuildinfo was not left behind by the first build — cannot reproduce the bug precondition.",
  );
}
if (existsSync(distMain)) fail("dist/main.js still exists after deleting dist/ — test setup is broken.");

console.log("[3/4] Running the normal build command again (dist gone, buildinfo stale)...");
run("pnpm run build");

console.log("[4/4] Confirming dist/main.js was recreated...");
if (!existsSync(distMain)) {
  fail("dist/main.js was NOT recreated — the stale-build-metadata bug has regressed.");
}

console.log("PASS: dist/main.js was correctly recreated after a dist-only deletion.");
