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
