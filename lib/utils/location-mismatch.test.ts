import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { LOCATION_MISMATCH_THRESHOLD_M, isLocationMismatch } from "./location-mismatch";

test("the report form warns above 50 m, not at 50 m", () => {
  assert.equal(LOCATION_MISMATCH_THRESHOLD_M, 50);
  assert.equal(isLocationMismatch(0), false);
  assert.equal(isLocationMismatch(50), false);
  assert.equal(isLocationMismatch(50.1), true);
  assert.equal(isLocationMismatch(120), true);
});

test("matches the API's LOCATION_MISMATCH_THRESHOLD_M", () => {
  const source = readFileSync(join(__dirname, "..", "..", "api", "src", "reports", "reports.service.ts"), "utf8");
  const api = /export const LOCATION_MISMATCH_THRESHOLD_M = (\d+(?:\.\d+)?);/.exec(source);
  assert.ok(api, "LOCATION_MISMATCH_THRESHOLD_M not found in api/src/reports/reports.service.ts");
  assert.equal(Number(api[1]), LOCATION_MISMATCH_THRESHOLD_M);
});
