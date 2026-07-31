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
