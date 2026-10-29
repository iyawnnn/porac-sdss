import {
  SEVERITY_FACTORS,
  severityFactor,
  severityLabelForFactor,
  ticketSeverity,
} from './severity';

// Manuscript pp. 73–74 (manuscript revision Phase 4, step 4a): a ticket's
// Severity Factor is the median of its member reports' factors, the mean of
// the two middle ones for an even count; its label is the nearest level,
// ties rounding up.

describe('ticketSeverity: the manuscript cases', () => {
  it('Low + High + Critical -> 0.75', () => {
    expect(ticketSeverity(['Low', 'High', 'Critical'])).toEqual({
      factor: 0.75,
      label: 'High',
      memberCount: 3,
    });
  });

  it('Medium + Critical -> 0.75', () => {
    expect(ticketSeverity(['Medium', 'Critical'])).toEqual({
      factor: 0.75,
      label: 'High',
      memberCount: 2,
    });
  });

  it.each(['Low', 'Medium', 'High', 'Critical'] as const)(
    'one %s report -> its own factor',
    (severity) => {
      expect(ticketSeverity([severity])).toEqual({
        factor: SEVERITY_FACTORS[severity],
        label: severity,
        memberCount: 1,
      });
    },
  );
});

describe('ticketSeverity: counts 1 to 5', () => {
  it.each<[string[], number, string]>([
    [['High'], 0.75, 'High'],
    [['Low', 'High'], 0.5, 'Medium'],
    [['Low', 'Medium'], 0.375, 'Medium'],
    [['Medium', 'High'], 0.625, 'High'],
    [['High', 'Critical'], 0.875, 'Critical'],
    [['Low', 'Low', 'Critical'], 0.25, 'Low'],
    [['Low', 'Medium', 'Critical', 'Critical'], 0.75, 'High'],
    [['Low', 'Low', 'High', 'Critical'], 0.5, 'Medium'],
    [['Low', 'Medium', 'High', 'Critical'], 0.625, 'High'],
    [['Low', 'Low', 'Medium', 'Critical', 'Critical'], 0.5, 'Medium'],
    [['Critical', 'Critical', 'Critical', 'Low', 'Low'], 1, 'Critical'],
  ])('%j -> %p (%s)', (severities, factor, label) => {
    expect(ticketSeverity(severities)).toEqual({
      factor,
      label,
      memberCount: severities.length,
    });
  });

  it('a single Critical among several reports does not decide the median', () => {
    expect(ticketSeverity(['Low', 'Low', 'Critical']).label).toBe('Low');
  });
});

describe('ticketSeverity: all equal, order and empty', () => {
  it.each(['Low', 'Medium', 'High', 'Critical'] as const)(
    'all %s -> %s',
    (severity) => {
      expect(ticketSeverity([severity, severity, severity, severity])).toEqual({
        factor: SEVERITY_FACTORS[severity],
        label: severity,
        memberCount: 4,
      });
    },
  );

  it('does not depend on the order of the reports', () => {
    const severities = ['Critical', 'Low', 'High', 'Medium', 'Low'];
    const expected = ticketSeverity(severities);
    const orders = [
      [...severities].reverse(),
      [...severities].sort(),
      ['Low', 'Low', 'Medium', 'High', 'Critical'],
      ['Medium', 'Critical', 'Low', 'High', 'Low'],
    ];
    for (const order of orders) {
      expect(ticketSeverity(order)).toEqual(expected);
    }
    expect(expected.factor).toBe(0.5);
  });

  it('does not change the list it is given', () => {
    const severities = ['High', 'Low', 'Critical'];
    ticketSeverity(severities);
    expect(severities).toEqual(['High', 'Low', 'Critical']);
  });

  it('an empty list counts as Low with no members, as the old rule did', () => {
    expect(ticketSeverity([])).toEqual({
      factor: 0.25,
      label: 'Low',
      memberCount: 0,
    });
  });

  it('an unknown value counts as Low, as the old SQL did', () => {
    expect(severityFactor('Extreme')).toBe(0.25);
    expect(ticketSeverity(['Extreme', 'Critical', 'Critical']).factor).toBe(1);
  });
});

describe('severityLabelForFactor: nearest level, ties up', () => {
  it.each<[number, string]>([
    [0.25, 'Low'],
    [0.375, 'Medium'],
    [0.5, 'Medium'],
    [0.625, 'High'],
    [0.75, 'High'],
    [0.875, 'Critical'],
    [1, 'Critical'],
    [0.3, 'Low'],
    [0.45, 'Medium'],
    [0, 'Low'],
    [1.2, 'Critical'],
  ])('%p -> %s', (factor, label) => {
    expect(severityLabelForFactor(factor)).toBe(label);
  });
});
