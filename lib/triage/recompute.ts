import { sql } from "@/lib/db/raw";
import { getCurrentRain1hMm } from "@/lib/weather/openweather";
import { getElevationBounds } from "@/lib/config";
import { computePriorityIndex, severityFromRank } from "@/lib/scoring";
import { computeUrgency } from "./urgency";

export async function recomputeActiveTicketUrgency(rainOverride?: number) {
  const rain1hMm = rainOverride ?? await getCurrentRain1hMm();
  const { elevMin, elevMax } = await getElevationBounds();

  const tickets = await sql<{
    id: number;
    elevation_m: number;
    member_count: number;
    created_at: string;
    severity_rank: number;
    active_barangay_count: number;
    max_active_barangay_count: number;
  }[]>`
    WITH barangay_density AS (
      SELECT barangay_id, COUNT(*)::int AS active_barangay_count
      FROM tickets
      WHERE status IN ('Reported', 'Under Review', 'In Progress')
      GROUP BY barangay_id
    ), severity_by_ticket AS (
      SELECT ticket_id, MAX(CASE citizen_severity
        WHEN 'Critical' THEN 4
        WHEN 'High' THEN 3
        WHEN 'Medium' THEN 2
        ELSE 1
      END)::int AS severity_rank
      FROM reports
      GROUP BY ticket_id
    )
    SELECT t.id, t.elevation_m, t.member_count, t.created_at,
      COALESCE(s.severity_rank, 1) AS severity_rank,
      d.active_barangay_count,
      MAX(d.active_barangay_count) OVER ()::int AS max_active_barangay_count
    FROM tickets t
    JOIN barangay_density d ON d.barangay_id = t.barangay_id
    LEFT JOIN severity_by_ticket s ON s.ticket_id = t.id
    WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
  `;

  if (tickets.length === 0) return { updated: 0, rain1hMm };

  const ids: number[] = [];
  const elevationFactors: number[] = [];
  const precipitationFactors: number[] = [];
  const clusterFactors: number[] = [];
  const urgencyScores: number[] = [];
  const urgencyBands: string[] = [];
  const priorityIndices: number[] = [];

  for (const ticket of tickets) {
    const urgency = computeUrgency({
      elevationM: ticket.elevation_m,
      elevMin,
      elevMax,
      memberCount: ticket.member_count,
      rain1hMm,
    });
    ids.push(ticket.id);
    elevationFactors.push(urgency.elevationFactor);
    precipitationFactors.push(urgency.precipitationFactor);
    clusterFactors.push(urgency.clusterFactor);
    urgencyScores.push(urgency.urgencyScore);
    urgencyBands.push(urgency.urgencyBand);
    priorityIndices.push(computePriorityIndex({
      severity: severityFromRank(ticket.severity_rank),
      createdAt: ticket.created_at,
      activeBarangayCount: ticket.active_barangay_count,
      maxActiveBarangayCount: ticket.max_active_barangay_count,
    }));
  }

  await sql`
    UPDATE tickets AS t SET
      elevation_factor = u.elevation_factor,
      precipitation_factor = u.precipitation_factor,
      cluster_factor = u.cluster_factor,
      urgency_score = u.urgency_score,
      urgency_band = u.urgency_band,
      priority_index = u.priority_index,
      updated_at = now()
    FROM (
      SELECT * FROM unnest(
        ${ids}::int[],
        ${elevationFactors}::real[],
        ${precipitationFactors}::real[],
        ${clusterFactors}::real[],
        ${urgencyScores}::real[],
        ${urgencyBands}::text[],
        ${priorityIndices}::int[]
      ) AS u(id, elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band, priority_index)
    ) AS u
    WHERE t.id = u.id
  `;

  return { updated: tickets.length, rain1hMm };
}