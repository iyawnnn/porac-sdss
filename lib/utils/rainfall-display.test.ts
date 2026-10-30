import assert from "node:assert/strict";
import test from "node:test";
import { formatRainfall, rainfallStateText } from "./ui/rainfall";

// Manuscript revision Phase 4, step 4c: the rainfall panel's wording.

test("a 0 mm reading shows as 0 mm, never as missing", () => {
  assert.equal(formatRainfall(0), "0 mm");
  assert.equal(rainfallStateText({ status: "CURRENT", rainfall_mm: 0 }), "0 mm");
  assert.equal(rainfallStateText({ status: "STALE", rainfall_mm: 0 }), "Last known: 0 mm");
});

test("values keep up to two decimals", () => {
  assert.equal(formatRainfall(12.5), "12.5 mm");
  assert.equal(formatRainfall(0.254), "0.25 mm");
  assert.equal(formatRainfall(3), "3 mm");
});

test("a failed fetch is Unavailable, never 0 mm", () => {
  assert.equal(rainfallStateText({ status: "UNAVAILABLE", rainfall_mm: null }), "Unavailable");
  assert.equal(rainfallStateText({ status: "CURRENT", rainfall_mm: null }), "Unavailable");
});
