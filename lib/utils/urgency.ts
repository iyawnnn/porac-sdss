export type UrgencyBand = "Low" | "Medium" | "High";
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

// Manuscript-aligned Hazard Urgency Level thresholds: LOW 0-39, MEDIUM 40-69,
// HIGH 70-100 on the 0-100 index. urgencyBand (below) derives from this same
// function instead of its own independent cutoff, so the two label sets can
// never disagree the way they used to (band said "Critical" above 0.7 on the
// raw 0-1 score while level said "HIGH" only above 80 on the 0-100 index).
const HAZARD_URGENCY_HIGH_THRESHOLD = 70;
const HAZARD_URGENCY_MEDIUM_THRESHOLD = 40;

const URGENCY_LEVEL_TO_BAND: Record<UrgencyLevel, UrgencyBand> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

// PLAN.md §7: 10 members is the cluster-density saturation/reference
// point. Logarithmic scaling means each additional duplicate report
// contributes less than the last (diminishing informational value), so by
// the 10th member the cluster factor has already reached its ceiling —
// memberCount >= CLUSTER_SATURATION_MEMBERS always yields clusterFactor 1.
const CLUSTER_SATURATION_MEMBERS = 10;

// Single source of truth for the priorityScore -> badge mapping, shared by
// the triage engine (writes urgency_level to the DB) and the frontend badge
// helper (re-derives it for display) so thresholds never drift apart.
export function urgencyLevelFromScore(priorityScore: number): UrgencyLevel {
  if (priorityScore >= HAZARD_URGENCY_HIGH_THRESHOLD) return "HIGH";
  if (priorityScore >= HAZARD_URGENCY_MEDIUM_THRESHOLD) return "MEDIUM";
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
  // memberCount is clamped to >= 0 before the log — a negative count has
  // no valid meaning here, and without the clamp log(1 + negative) can
  // produce a negative value, -Infinity, or NaN that would corrupt
  // urgencyScore below. memberCount is never negative in practice (DB
  // default 1, only ever incremented), but the calculation shouldn't rely
  // on that being true forever.
  const clusterFactor = Math.min(
    Math.log(1 + Math.max(memberCount, 0)) / Math.log(1 + CLUSTER_SATURATION_MEMBERS),
    1.0,
  );

  const urgencyScore =
    (1 / 3) * elevationFactor + (1 / 3) * precipitationFactor + (1 / 3) * clusterFactor;

  // Environmental urgency is elevation + precipitation only — cluster
  // density is a priority input, not a hazard-severity signal.
  const environmentalUrgencyScore = Math.round(((elevationFactor + precipitationFactor) / 2) * 100);

  // Same equal-thirds weighting as urgencyScore above (elevation,
  // precipitation, cluster), expressed as one 0-100 number instead of three
  // separately-badged values.
  const priorityScore = Math.round(urgencyScore * 100);
  const urgencyLevel = urgencyLevelFromScore(priorityScore);
  // urgencyBand is a Title-Case restatement of urgencyLevel, not an
  // independently-thresholded value — see the comment above
  // HAZARD_URGENCY_HIGH_THRESHOLD.
  const urgencyBand = URGENCY_LEVEL_TO_BAND[urgencyLevel];

  return {
    elevationFactor,
    precipitationFactor,
    clusterFactor,
    urgencyScore,
    urgencyBand,
    environmentalUrgencyScore,
    priorityScore,
    urgencyLevel,
  };
}
