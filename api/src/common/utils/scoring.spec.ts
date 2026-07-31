import { computePriorityIndex } from './scoring';

const now = new Date('2026-07-28T00:00:00.000Z');

function score(
  overrides: Partial<Parameters<typeof computePriorityIndex>[0]> = {},
) {
  return computePriorityIndex({
    severity: 'Low',
    createdAt: now,
    activeBarangayCount: 0,
    maxActiveBarangayCount: 0,
    now,
    ...overrides,
  });
}

describe('computePriorityIndex', () => {
  it('stays within the 1-100 range', () => {
    expect(score()).toBe(13);
    expect(
      score({
        severity: 'Critical',
        createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        activeBarangayCount: 8,
        maxActiveBarangayCount: 8,
      }),
    ).toBe(100);
  });

  it('respects severity, age, and barangay density', () => {
    const baseline = score({
      activeBarangayCount: 1,
      maxActiveBarangayCount: 4,
    });
    expect(
      score({
        severity: 'High',
        activeBarangayCount: 1,
        maxActiveBarangayCount: 4,
      }),
    ).toBeGreaterThan(baseline);
    expect(
      score({
        createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        activeBarangayCount: 1,
        maxActiveBarangayCount: 4,
      }),
    ).toBeGreaterThan(baseline);
    expect(
      score({ activeBarangayCount: 4, maxActiveBarangayCount: 4 }),
    ).toBeGreaterThan(baseline);
  });
});
