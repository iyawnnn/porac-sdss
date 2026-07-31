export type UrgencyBand = "Low" | "Medium" | "Critical";
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH";

export interface UrgencyFactors {
  elevationFactor: number;
  precipitationFactor: number;
  clusterFactor: number;
  urgencyScore: number;
  urgencyBand: UrgencyBand;
  // Elevation + precipitation only, 0-100 (see environmentalUrgencyScore()).
  environmentalUrgencyScore: number;
  // Single 0-100 score the admin Ticket Queue sorts/badges by — weighted
  // composite of environmental urgency + cluster density. urgencyLevel is
  // *derived* from this score (never computed independently) so the queue's
  // PRIORITY number and URGENCY badge can never disagree.
  priorityScore: number;
  urgencyLevel: UrgencyLevel;
}

const PRIORITY_HIGH_THRESHOLD = 80;
const PRIORITY_MEDIUM_THRESHOLD = 50;

// Single source of truth for the priorityScore -> badge mapping, shared by
// the triage engine (writes urgency_level to the DB) and the frontend badge
// helper (re-derives it for display) so thresholds never drift apart.
export function urgencyLevelFromScore(priorityScore: number): UrgencyLevel {
  if (priorityScore >= PRIORITY_HIGH_THRESHOLD) return "HIGH";
  if (priorityScore >= PRIORITY_MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

// PLAN.md §7. Weights are provisional (1/3 each, pending MEO/MDRRMO
// consultation per PLAN.md §15).
export function computeUrgency({
  elevationM,
  elevMin,
  elevMax,
  memberCount,
  rain1hMm = 0,
}: {
  elevationM: number;
  elevMin: number;
  elevMax: number;
  memberCount: number;
  rain1hMm?: number;
}): UrgencyFactors {
  const elevationFactor = (elevMax - elevationM) / (elevMax - elevMin);
  const precipitationFactor = Math.min(rain1hMm / 30, 1.0);
  const clusterFactor = Math.min(Math.log(1 + memberCount) / Math.log(1 + 10), 1.0);

  const urgencyScore =
    (1 / 3) * elevationFactor + (1 / 3) * precipitationFactor + (1 / 3) * clusterFactor;

  const urgencyBand: UrgencyBand =
    urgencyScore < 0.4 ? "Low" : urgencyScore <= 0.7 ? "Medium" : "Critical";

  // Environmental urgency is elevation + precipitation only — cluster
  // density is a priority input, not a hazard-severity signal.
  const environmentalUrgencyScore = Math.round(((elevationFactor + precipitationFactor) / 2) * 100);

  // Same equal-thirds weighting as urgencyScore above (elevation,
  // precipitation, cluster), expressed as one 0-100 number instead of three
  // separately-badged values.
  const priorityScore = Math.round(urgencyScore * 100);

  return {
    elevationFactor,
    precipitationFactor,
    clusterFactor,
    urgencyScore,
    urgencyBand,
    environmentalUrgencyScore,
    priorityScore,
    urgencyLevel: urgencyLevelFromScore(priorityScore),
  };
}
