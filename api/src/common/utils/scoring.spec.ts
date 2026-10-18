import {
  computePriorityBreakdown,
  computePriorityIndex,
  severityFromRank,
} from './scoring';

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

const DAY_MS = 24 * 60 * 60 * 1000;

function breakdown(
  overrides: Partial<Parameters<typeof computePriorityBreakdown>[0]> = {},
) {
  return computePriorityBreakdown({
    severity: 'Low',
    createdAt: now,
    activeBarangayCount: 0,
    maxActiveBarangayCount: 0,
    now,
    ...overrides,
  });
}

describe('computePriorityBreakdown (Operational Priority formula)', () => {
  it.each([
    [0, 0],
    [3.5, 0.5],
    [7, 1],
    [20, 1],
  ])('age %p days -> age factor %p (capped at 7 days)', (days, expected) => {
    const result = breakdown({
      createdAt: new Date(now.getTime() - days * DAY_MS),
    });
    expect(result.ageFactor).toBeCloseTo(expected, 10);
  });

  it('treats a future or invalid created_at as age 0', () => {
    expect(
      breakdown({ createdAt: new Date(now.getTime() + DAY_MS) }).ageFactor,
    ).toBe(0);
    expect(breakdown({ createdAt: 'not-a-date' }).ageFactor).toBe(0);
  });

  it('maps severity to 0.25 / 0.50 / 0.75 / 1.00', () => {
    expect(breakdown({ severity: 'Low' }).severityFactor).toBe(0.25);
    expect(breakdown({ severity: 'Medium' }).severityFactor).toBe(0.5);
    expect(breakdown({ severity: 'High' }).severityFactor).toBe(0.75);
    expect(breakdown({ severity: 'Critical' }).severityFactor).toBe(1);
  });

  it('weights severity 0.50, age 0.25, barangay demand 0.25', () => {
    const result = breakdown({
      severity: 'Critical',
      createdAt: new Date(now.getTime() - 7 * DAY_MS),
      activeBarangayCount: 4,
      maxActiveBarangayCount: 4,
    });
    expect(result.severityContribution).toBeCloseTo(0.5, 10);
    expect(result.ageContribution).toBeCloseTo(0.25, 10);
    expect(result.spatialContribution).toBeCloseTo(0.25, 10);
    expect(result.priorityIndex).toBe(100);
  });

  it('scales to round(1 + x * 99)', () => {
    // Medium, new, no demand -> 0.25 -> round(25.75) = 26
    expect(breakdown({ severity: 'Medium' }).priorityIndex).toBe(26);
    // Low, 3.5 days, half demand -> 0.125 + 0.125 + 0.125 = 0.375 -> 38
    expect(
      breakdown({
        createdAt: new Date(now.getTime() - 3.5 * DAY_MS),
        activeBarangayCount: 2,
        maxActiveBarangayCount: 4,
      }).priorityIndex,
    ).toBe(38);
  });

  it('clamps barangay demand to 0-1 and handles an empty max', () => {
    expect(
      breakdown({ activeBarangayCount: 9, maxActiveBarangayCount: 3 })
        .spatialFactor,
    ).toBe(1);
    expect(
      breakdown({ activeBarangayCount: 3, maxActiveBarangayCount: 0 })
        .spatialFactor,
    ).toBe(0);
  });
});

describe('severityFromRank', () => {
  it('maps the SQL MAX rank back to a severity label', () => {
    expect(severityFromRank(4)).toBe('Critical');
    expect(severityFromRank(3)).toBe('High');
    expect(severityFromRank(2)).toBe('Medium');
    expect(severityFromRank(1)).toBe('Low');
    expect(severityFromRank(0)).toBe('Low');
  });
});
