export type CitizenSeverity = "Low" | "Medium" | "High" | "Critical";

const SEVERITY_FACTORS: Record<CitizenSeverity, number> = {
  Low: 0.25,
  Medium: 0.5,
  High: 0.75,
  Critical: 1,
};

export function severityFromRank(rank: number): CitizenSeverity {
  if (rank >= 4) return "Critical";
  if (rank === 3) return "High";
  if (rank === 2) return "Medium";
  return "Low";
}

export function computePriorityIndex({
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
}): number {
  const createdAtMs = new Date(createdAt).getTime();
  const ageFactor = Number.isFinite(createdAtMs)
    ? Math.min(Math.max((now.getTime() - createdAtMs) / (7 * 24 * 60 * 60 * 1000), 0), 1)
    : 0;
  const spatialFactor = maxActiveBarangayCount > 0
    ? Math.min(Math.max(activeBarangayCount / maxActiveBarangayCount, 0), 1)
    : 0;
  const weightedFactor =
    SEVERITY_FACTORS[severity] * 0.5 + ageFactor * 0.25 + spatialFactor * 0.25;

  return Math.min(100, Math.max(1, Math.round(1 + weightedFactor * 99)));
}