export type CitizenSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

const SEVERITY_FACTORS: Record<CitizenSeverity, number> = {
  Low: 0.25,
  Medium: 0.5,
  High: 0.75,
  Critical: 1,
};

export function severityFromRank(rank: number): CitizenSeverity {
  if (rank >= 4) return 'Critical';
  if (rank === 3) return 'High';
  if (rank === 2) return 'Medium';
  return 'Low';
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

export interface PriorityBreakdown {
  severity: CitizenSeverity;
  severityFactor: number;
  ageFactor: number;
  spatialFactor: number;
  // Each *Contribution is the factor already multiplied by its formula
  // weight, so the three sum to the same 0-1 range priorityIndex is scaled
  // from — lets the UI show "this factor contributed X" directly.
  severityContribution: number;
  ageContribution: number;
  spatialContribution: number;
  priorityIndex: number;
}

export function computePriorityBreakdown({
  severity,
  createdAt,
  activeBarangayCount,
  maxActiveBarangayCount,
  now = new Date(),
}: {
  severity: CitizenSeverity;
  createdAt: Date | string;
  activeBarangayCount: number;
  maxActiveBarangayCount: number;
  now?: Date;
}): PriorityBreakdown {
  const createdAtMs = new Date(createdAt).getTime();
  const ageFactor = Number.isFinite(createdAtMs)
    ? clamp01((now.getTime() - createdAtMs) / (7 * 24 * 60 * 60 * 1000))
    : 0;
  const spatialFactor =
    maxActiveBarangayCount > 0
      ? clamp01(activeBarangayCount / maxActiveBarangayCount)
      : 0;
  const severityFactor = SEVERITY_FACTORS[severity];

  const severityContribution = severityFactor * 0.5;
  const ageContribution = ageFactor * 0.25;
  const spatialContribution = spatialFactor * 0.25;
  const weightedFactor =
    severityContribution + ageContribution + spatialContribution;
  const priorityIndex = Math.min(
    100,
    Math.max(1, Math.round(1 + weightedFactor * 99)),
  );

  return {
    severity,
    severityFactor,
    ageFactor,
    spatialFactor,
    severityContribution,
    ageContribution,
    spatialContribution,
    priorityIndex,
  };
}

export function computePriorityIndex(
  args: Parameters<typeof computePriorityBreakdown>[0],
): number {
  return computePriorityBreakdown(args).priorityIndex;
}
