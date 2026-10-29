import assert from "node:assert/strict";
import test from "node:test";
import { computePriorityIndex } from "./scoring";

const now = new Date("2026-07-28T00:00:00.000Z");

function score(overrides: Partial<Parameters<typeof computePriorityIndex>[0]> = {}) {
  return computePriorityIndex({
    severity: "Low",
    createdAt: now,
    activeBarangayCount: 0,
    maxActiveBarangayCount: 0,
    now,
    ...overrides,
  });
}

test("Priority Index stays within the 1-100 range", () => {
  assert.equal(score(), 13);
  assert.equal(score({ severity: "Critical", createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), activeBarangayCount: 8, maxActiveBarangayCount: 8 }), 100);
});

test("Priority Index respects severity, age, and barangay density", () => {
  const baseline = score({ activeBarangayCount: 1, maxActiveBarangayCount: 4 });
  assert.ok(score({ severity: "High", activeBarangayCount: 1, maxActiveBarangayCount: 4 }) > baseline);
  assert.ok(score({ createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), activeBarangayCount: 1, maxActiveBarangayCount: 4 }) > baseline);
  assert.ok(score({ activeBarangayCount: 4, maxActiveBarangayCount: 4 }) > baseline);
});
// Manuscript revision Phase 4, step 4a: the ticket's median Severity Factor
// is passed as an exact number (mirrors api/src/common/utils/scoring.ts).
test("Priority Index uses an exact median severityFactor when given", () => {
  assert.equal(score({ severity: "High", severityFactor: 0.625 }), 32);
  assert.equal(score({ severity: "High" }), 38);
  assert.equal(score({ severity: "High", severityFactor: 0.75 }), 38);
});
