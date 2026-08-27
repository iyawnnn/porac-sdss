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

test("computeUrgency's urgencyBand is always the Title-Case restatement of urgencyLevel", () => {
  const LEVEL_TO_BAND: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
  for (const elevationM of [0, 25, 50, 75, 100]) {
    for (const memberCount of [0, 1, 5, 20]) {
      for (const rain1hMm of [0, 15, 30]) {
        const u = computeUrgency({ elevationM, elevMin: 0, elevMax: 100, memberCount, rain1hMm });
        assert.equal(u.urgencyBand, LEVEL_TO_BAND[u.urgencyLevel]);
      }
    }
  }
});

// elevationFactor (elevation normalization, correctness fix).
const ELEVATION_TEST_BASE = { elevMin: 0, elevMax: 100, memberCount: 1, rain1hMm: 0 };

test('elevationFactor: elevation exactly at elevMin produces the maximum factor of 1', () => {
  assert.equal(computeUrgency({ ...ELEVATION_TEST_BASE, elevationM: 0 }).elevationFactor, 1);
});

test('elevationFactor: elevation exactly at elevMax produces the minimum factor of 0', () => {
  assert.equal(computeUrgency({ ...ELEVATION_TEST_BASE, elevationM: 100 }).elevationFactor, 0);
});

test('elevationFactor: elevation below elevMin clamps to 1 rather than exceeding it', () => {
  assert.equal(computeUrgency({ ...ELEVATION_TEST_BASE, elevationM: -50 }).elevationFactor, 1);
});

test('elevationFactor: elevation above elevMax clamps to 0 rather than going negative', () => {
  assert.equal(computeUrgency({ ...ELEVATION_TEST_BASE, elevationM: 250 }).elevationFactor, 0);
});

test('elevationFactor: null elevation (unseeded DEM lookup) falls back to the neutral midpoint, not maximum hazard', () => {
  const u = computeUrgency({ ...ELEVATION_TEST_BASE, elevationM: null });
  closeTo(u.elevationFactor, 0.5);
  assert.ok(u.elevationFactor < 1);
});

test('elevationFactor: non-finite elevation input (NaN, Infinity, -Infinity) falls back to the same neutral midpoint', () => {
  for (const elevationM of [NaN, Infinity, -Infinity]) {
    const u = computeUrgency({ ...ELEVATION_TEST_BASE, elevationM });
    closeTo(u.elevationFactor, 0.5);
    assert.ok(Number.isFinite(u.urgencyScore));
    assert.ok(Number.isFinite(u.priorityScore));
  }
});

test('elevationFactor: degenerate elevMin === elevMax falls back to the neutral midpoint instead of NaN/Infinity', () => {
  const u = computeUrgency({ elevationM: 50, elevMin: 50, elevMax: 50, memberCount: 1, rain1hMm: 0 });
  assert.equal(u.elevationFactor, 0.5);
  assert.ok(Number.isFinite(u.urgencyScore));
});

test('elevationFactor: priorityScore never exceeds 100 or falls below 0, including every invalid-elevation case above', () => {
  for (const elevationM of [0, 100, -50, 250, null, NaN, Infinity, -Infinity]) {
    const u = computeUrgency({ ...ELEVATION_TEST_BASE, elevationM });
    assert.ok(u.priorityScore >= 0);
    assert.ok(u.priorityScore <= 100);
  }
});

// clusterFactor (cluster-density normalization, Issue #3). Same base
// elevation/rain inputs and expected values as api/src/domain/urgency.spec.ts
// so the backend and frontend copies are verified equivalent.
const CLUSTER_TEST_BASE = { elevationM: 50, elevMin: 0, elevMax: 100, rain1hMm: 0 };

function closeTo(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${actual} to be close to ${expected}`);
}

test('clusterFactor: memberCount 0 produces clusterFactor 0', () => {
  assert.equal(computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 0 }).clusterFactor, 0);
});

test('clusterFactor: memberCount 1 produces the expected logarithmic result', () => {
  closeTo(computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 1 }).clusterFactor, 0.2890648263);
});

test('clusterFactor: memberCount 9 stays below the saturation cap', () => {
  const clusterFactor = computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 9 }).clusterFactor;
  closeTo(clusterFactor, 0.9602525678);
  assert.ok(clusterFactor < 1);
});

test('clusterFactor: memberCount 10 produces exactly the saturation cap of 1', () => {
  assert.equal(computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 10 }).clusterFactor, 1);
});

test('clusterFactor: memberCount above the saturation point stays capped at 1', () => {
  assert.equal(computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 11 }).clusterFactor, 1);
  assert.equal(computeUrgency({ ...CLUSTER_TEST_BASE, memberCount: 1000 }).clusterFactor, 1);
});

test('clusterFactor: negative memberCount is safely bounded to 0 and never corrupts the urgency result', () => {
  for (const memberCount of [-1, -5, -1000]) {
    const u = computeUrgency({ ...CLUSTER_TEST_BASE, memberCount });
    assert.equal(u.clusterFactor, 0);
    assert.ok(Number.isFinite(u.urgencyScore));
    assert.ok(Number.isFinite(u.priorityScore));
    assert.ok(!Number.isNaN(u.urgencyScore));
    assert.ok(u.urgencyScore >= 0);
    assert.ok(u.priorityScore >= 0);
  }
});

test('clusterFactor: is monotonically non-decreasing from memberCount 0 through 20', () => {
  let previous = -Infinity;
  for (let memberCount = 0; memberCount <= 20; memberCount++) {
    const clusterFactor = computeUrgency({ ...CLUSTER_TEST_BASE, memberCount }).clusterFactor;
    assert.ok(clusterFactor >= previous);
    previous = clusterFactor;
  }
});
