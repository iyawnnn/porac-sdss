#!/usr/bin/env node
// Deletes stale NestJS build output/metadata before every compile.
//
// Root cause of the recurring "Cannot find module dist/main" bug: tsc's
// incremental cache (tsconfig.build.tsbuildinfo, see tsconfig.json's
// `incremental: true`) lives outside dist/ and survives nest-cli's
// `deleteOutDir: true`. If dist/ is ever deleted independently of a build
// (manually, by a killed process, by a prior failed build), the next
// `nest build`/`nest start` reads the surviving buildinfo, believes every
// file is already emitted, and silently skips writing dist/main.js — the
// build "succeeds" with no dist output and no error.
//
// Run before every build/start command (wired into package.json) so
// nothing can ever trust a buildinfo that's out of sync with dist/. Pure
// Node fs — no dependency needed, works identically on Windows/macOS/Linux.
const { rmSync, existsSync } = require("fs");
const { join } = require("path");

const apiRoot = join(__dirname, "..");
const targets = [
  join(apiRoot, "dist"),
  join(apiRoot, "tsconfig.build.tsbuildinfo"),
];

for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}
