import { computeUrgency, urgencyLevelFromScore } from './urgency';

describe('urgencyLevelFromScore', () => {
  it('has deterministic thresholds', () => {
    expect(urgencyLevelFromScore(100)).toBe('HIGH');
    expect(urgencyLevelFromScore(80)).toBe('HIGH');
    expect(urgencyLevelFromScore(79)).toBe('MEDIUM');
    expect(urgencyLevelFromScore(50)).toBe('MEDIUM');
    expect(urgencyLevelFromScore(49)).toBe('LOW');
    expect(urgencyLevelFromScore(0)).toBe('LOW');
  });
});

describe('computeUrgency', () => {
  it('urgencyLevel always matches its own priorityScore', () => {
    for (const elevationM of [0, 25, 50, 75, 100]) {
      for (const memberCount of [1, 5, 20]) {
        for (const rain1hMm of [0, 15, 30]) {
          const u = computeUrgency({
            elevationM,
            elevMin: 0,
            elevMax: 100,
            memberCount,
            rain1hMm,
          });
          expect(u.urgencyLevel).toBe(urgencyLevelFromScore(u.priorityScore));
          expect(u.priorityScore).toBeGreaterThanOrEqual(0);
          expect(u.priorityScore).toBeLessThanOrEqual(100);
          expect(u.environmentalUrgencyScore).toBeGreaterThanOrEqual(0);
          expect(u.environmentalUrgencyScore).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('urgencyBand is always the Title-Case restatement of urgencyLevel — the two can never disagree', () => {
    const LEVEL_TO_BAND = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' } as const;
    for (const elevationM of [0, 25, 50, 75, 100]) {
      for (const memberCount of [0, 1, 5, 20]) {
        for (const rain1hMm of [0, 15, 30]) {
          const u = computeUrgency({ elevationM, elevMin: 0, elevMax: 100, memberCount, rain1hMm });
          expect(u.urgencyBand).toBe(LEVEL_TO_BAND[u.urgencyLevel]);
        }
      }
    }
  });
});

// Phase 6 manuscript-alignment regression guard: nothing previously pinned
// the exact 1/3 + 1/3 + 1/3 weighting — the tests above only assert
// invariants (range, level/band agreement) that would still pass even if
// the weights drifted (e.g. 0.5/0.25/0.25) as long as monotonicity held.
describe('computeUrgency weighting (equal thirds, manuscript-required)', () => {
  it('urgencyScore is the unweighted mean of the three factors', () => {
    const u = computeUrgency({ elevationM: 20, elevMin: 0, elevMax: 100, memberCount: 4, rain1hMm: 12 });
    const mean = (u.elevationFactor + u.precipitationFactor + u.clusterFactor) / 3;
    expect(u.urgencyScore).toBeCloseTo(mean, 10);
  });

  it('changing only one factor moves urgencyScore by exactly a third of that factor\'s delta', () => {
    const base = computeUrgency({ elevationM: 50, elevMin: 0, elevMax: 100, memberCount: 1, rain1hMm: 0 });
    const moreRain = computeUrgency({ elevationM: 50, elevMin: 0, elevMax: 100, memberCount: 1, rain1hMm: 30 });
    const precipitationDelta = moreRain.precipitationFactor - base.precipitationFactor;
    expect(moreRain.urgencyScore - base.urgencyScore).toBeCloseTo(precipitationDelta / 3, 10);
  });

  it('citizen-reported severity is not an input to computeUrgency', () => {
    // Structural guard: computeUrgency's parameter type has no severity
    // field, so this only compiles because severity is genuinely absent.
    const params: Parameters<typeof computeUrgency>[0] = {
      elevationM: 10,
      elevMin: 0,
      elevMax: 100,
      memberCount: 2,
      rain1hMm: 5,
    };
    expect('citizen_severity' in params).toBe(false);
    expect('severity' in params).toBe(false);
  });
});

describe('elevationFactor (elevation normalization, correctness fix)', () => {
  const base = { elevMin: 0, elevMax: 100, memberCount: 1, rain1hMm: 0 };

  it('elevation exactly at elevMin produces the maximum factor of 1', () => {
    expect(computeUrgency({ ...base, elevationM: 0 }).elevationFactor).toBe(1);
  });

  it('elevation exactly at elevMax produces the minimum factor of 0', () => {
    expect(computeUrgency({ ...base, elevationM: 100 }).elevationFactor).toBe(0);
  });

  it('elevation below elevMin clamps to 1 rather than exceeding it', () => {
    expect(computeUrgency({ ...base, elevationM: -50 }).elevationFactor).toBe(1);
  });

  it('elevation above elevMax clamps to 0 rather than going negative', () => {
    expect(computeUrgency({ ...base, elevationM: 250 }).elevationFactor).toBe(0);
  });

  it('null elevation (unseeded DEM lookup) falls back to the neutral midpoint, not maximum hazard', () => {
    const u = computeUrgency({ ...base, elevationM: null });
    expect(u.elevationFactor).toBeCloseTo(0.5, 10);
    expect(u.elevationFactor).toBeLessThan(1);
  });

  it('non-finite elevation input (NaN, Infinity, -Infinity) falls back to the same neutral midpoint', () => {
    for (const elevationM of [NaN, Infinity, -Infinity]) {
      const u = computeUrgency({ ...base, elevationM });
      expect(u.elevationFactor).toBeCloseTo(0.5, 10);
      expect(Number.isFinite(u.urgencyScore)).toBe(true);
      expect(Number.isFinite(u.priorityScore)).toBe(true);
    }
  });

  it('degenerate elevMin === elevMax (no range to normalize against) falls back to the neutral midpoint instead of NaN/Infinity', () => {
    const u = computeUrgency({ elevationM: 50, elevMin: 50, elevMax: 50, memberCount: 1, rain1hMm: 0 });
    expect(u.elevationFactor).toBe(0.5);
    expect(Number.isFinite(u.urgencyScore)).toBe(true);
  });

  it('priorityScore never exceeds 100 or falls below 0, including every invalid-elevation case above', () => {
    for (const elevationM of [0, 100, -50, 250, null, NaN, Infinity, -Infinity]) {
      const u = computeUrgency({ ...base, elevationM });
      expect(u.priorityScore).toBeGreaterThanOrEqual(0);
      expect(u.priorityScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('clusterFactor (cluster-density normalization, Issue #3)', () => {
  const base = { elevationM: 50, elevMin: 0, elevMax: 100, rain1hMm: 0 };

  it('memberCount 0 produces clusterFactor 0', () => {
    expect(computeUrgency({ ...base, memberCount: 0 }).clusterFactor).toBe(0);
  });

  it('memberCount 1 produces the expected logarithmic result', () => {
    expect(computeUrgency({ ...base, memberCount: 1 }).clusterFactor).toBeCloseTo(0.2890648263, 9);
  });

  it('memberCount 9 stays below the saturation cap', () => {
    const clusterFactor = computeUrgency({ ...base, memberCount: 9 }).clusterFactor;
    expect(clusterFactor).toBeCloseTo(0.9602525678, 9);
    expect(clusterFactor).toBeLessThan(1);
  });

  it('memberCount 10 produces exactly the saturation cap of 1', () => {
    expect(computeUrgency({ ...base, memberCount: 10 }).clusterFactor).toBe(1);
  });

  it('memberCount above the saturation point stays capped at 1', () => {
    expect(computeUrgency({ ...base, memberCount: 11 }).clusterFactor).toBe(1);
    expect(computeUrgency({ ...base, memberCount: 1000 }).clusterFactor).toBe(1);
  });

  it('negative memberCount is safely bounded to 0 and never corrupts the urgency result', () => {
    for (const memberCount of [-1, -5, -1000]) {
      const u = computeUrgency({ ...base, memberCount });
      expect(u.clusterFactor).toBe(0);
      expect(Number.isFinite(u.urgencyScore)).toBe(true);
      expect(Number.isFinite(u.priorityScore)).toBe(true);
      expect(Number.isNaN(u.urgencyScore)).toBe(false);
      expect(u.urgencyScore).toBeGreaterThanOrEqual(0);
      expect(u.priorityScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('is monotonically non-decreasing from memberCount 0 through 20', () => {
    let previous = -Infinity;
    for (let memberCount = 0; memberCount <= 20; memberCount++) {
      const clusterFactor = computeUrgency({ ...base, memberCount }).clusterFactor;
      expect(clusterFactor).toBeGreaterThanOrEqual(previous);
      previous = clusterFactor;
    }
  });
});
