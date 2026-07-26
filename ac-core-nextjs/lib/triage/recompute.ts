import { sql } from "@/lib/db/raw";
import { getCurrentRain1hMm } from "@/lib/weather/openweather";
import { getElevationBounds } from "@/lib/config";
import { computeUrgency } from "./urgency";

// PLAN.md §7 "Recomputation": precipitation changes independently of any
// citizen action, so active tickets need their urgency re-run against
// current weather, not just at submission time.
//
// No scheduled trigger for this yet — Vercel Hobby only runs cron jobs
// once a day, which would gut the "live re-ranking as a storm moves in"
// behavior PLAN.md calls out as the most demo-friendly feature. Call this
// on-demand instead (e.g. from the admin dashboard's ticket-list load in
// Phase 5) so it recomputes exactly when someone's watching the queue.
// getCurrentRain1hMm() is still cached (~10min), so calling this on every
// dashboard load won't hammer the OpenWeatherMap API.
export async function recomputeActiveTicketUrgency() {
  const rain1hMm = await getCurrentRain1hMm();
  const { elevMin, elevMax } = await getElevationBounds();

  const tickets = await sql<{ id: number; elevation_m: number; member_count: number }[]>`
    SELECT id, elevation_m, member_count
    FROM tickets
    WHERE status IN ('Reported', 'Under Review', 'In Progress')
  `;

  if (tickets.length === 0) {
    return { updated: 0, rain1hMm };
  }

  const ids: number[] = [];
  const elevationFactors: number[] = [];
  const precipitationFactors: number[] = [];
  const clusterFactors: number[] = [];
  const urgencyScores: number[] = [];
  const urgencyBands: string[] = [];

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
  }

  // Batch update via UNNEST — one round trip instead of one query per ticket.
  await sql`
    UPDATE tickets AS t SET
      elevation_factor = u.elevation_factor,
      precipitation_factor = u.precipitation_factor,
      cluster_factor = u.cluster_factor,
      urgency_score = u.urgency_score,
      urgency_band = u.urgency_band,
      updated_at = now()
    FROM (
      SELECT * FROM unnest(
        ${ids}::int[],
        ${elevationFactors}::real[],
        ${precipitationFactors}::real[],
        ${clusterFactors}::real[],
        ${urgencyScores}::real[],
        ${urgencyBands}::text[]
      ) AS u(id, elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band)
    ) AS u
    WHERE t.id = u.id
  `;

  return { updated: tickets.length, rain1hMm };
}
