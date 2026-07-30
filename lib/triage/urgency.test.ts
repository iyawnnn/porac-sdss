import assert from "node:assert/strict";
import test from "node:test";
import { computeUrgency, urgencyLevelFromScore } from "./urgency";

test("urgencyLevelFromScore thresholds are deterministic", () => {
  assert.equal(urgencyLevelFromScore(100), "HIGH");
  assert.equal(urgencyLevelFromScore(80), "HIGH");
  assert.equal(urgencyLevelFromScore(79), "MEDIUM");
  assert.equal(urgencyLevelFromScore(50), "MEDIUM");
  assert.equal(urgencyLevelFromScore(49), "LOW");
  assert.equal(urgencyLevelFromScore(0), "LOW");
});

test("computeUrgency's urgencyLevel always matches its own priorityScore", () => {
  for (const elevationM of [0, 25, 50, 75, 100]) {
    for (const memberCount of [1, 5, 20]) {
      for (const rain1hMm of [0, 15, 30]) {
        const u = computeUrgency({ elevationM, elevMin: 0, elevMax: 100, memberCount, rain1hMm });
        assert.equal(u.urgencyLevel, urgencyLevelFromScore(u.priorityScore));
        assert.ok(u.priorityScore >= 0 && u.priorityScore <= 100);
        assert.ok(u.environmentalUrgencyScore >= 0 && u.environmentalUrgencyScore <= 100);
      }
    }
  }
});
