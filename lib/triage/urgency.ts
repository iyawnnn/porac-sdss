export type UrgencyBand = "Low" | "Medium" | "Critical";

export interface UrgencyFactors {
  elevationFactor: number;
  precipitationFactor: number;
  clusterFactor: number;
  urgencyScore: number;
  urgencyBand: UrgencyBand;
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

  return { elevationFactor, precipitationFactor, clusterFactor, urgencyScore, urgencyBand };
}
