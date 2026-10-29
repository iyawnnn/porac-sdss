// Ticket severity from its member reports (manuscript pp. 73–74; manuscript
// revision Phase 4, step 4a). Each report keeps the severity its citizen
// chose; the ticket's Severity Factor is derived from them, never stored:
//   - one report: that report's factor;
//   - several: the MEDIAN of the members' numeric factors, and for an even
//     count the arithmetic mean of the two middle factors.
// Operational Priority uses the numeric factor directly, so it is exact.
// The label is only for display: the nearest label to the factor, and a
// factor exactly halfway between two labels (0.375, 0.625, 0.875) rounds UP
// to the higher one.
//
// This is the ONLY place severity is aggregated (the old MAX rule is gone).

export type CitizenSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export const SEVERITY_FACTORS: Record<CitizenSeverity, number> = {
  Low: 0.25,
  Medium: 0.5,
  High: 0.75,
  Critical: 1,
};

const LABELS: readonly CitizenSeverity[] = [
  'Low',
  'Medium',
  'High',
  'Critical',
];

export interface TicketSeverity {
  // The Severity Factor, 0.25–1 in steps of 0.125.
  factor: number;
  // Display label derived from factor (nearest, ties up).
  label: CitizenSeverity;
  // How many member reports the median was taken over.
  memberCount: number;
}

// A value outside the four levels counts as Low, as the old SQL's ELSE
// branch did (reports.citizen_severity is validated on submission, so this
// is only a guard).
export function severityFactor(severity: string): number {
  return SEVERITY_FACTORS[severity as CitizenSeverity] ?? SEVERITY_FACTORS.Low;
}

// Nearest label; a tie (exactly halfway) goes to the higher label.
export function severityLabelForFactor(factor: number): CitizenSeverity {
  const steps = Math.floor(factor * 4 + 0.5 + 1e-9); // 1..4
  return LABELS[Math.min(Math.max(steps, 1), 4) - 1];
}

// A ticket with no linked report (it can't happen through the app: every
// ticket is created with its report, and the last report can't be removed)
// counts as Low, as before.
export function ticketSeverity(
  memberSeverities: readonly string[],
): TicketSeverity {
  if (memberSeverities.length === 0) {
    return { factor: SEVERITY_FACTORS.Low, label: 'Low', memberCount: 0 };
  }
  const factors = memberSeverities.map(severityFactor).sort((a, b) => a - b);
  const middle = Math.floor(factors.length / 2);
  const factor =
    factors.length % 2 === 1
      ? factors[middle]
      : (factors[middle - 1] + factors[middle]) / 2;
  return {
    factor,
    label: severityLabelForFactor(factor),
    memberCount: factors.length,
  };
}
