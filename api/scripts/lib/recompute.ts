import { sql } from "../db";
import { computePriorityIndex, severityFromRank } from "../../../lib/utils/scoring";

// Seed-side Operational Priority recalculation (tickets.priority_index only),
// mirroring api/src/domain/operational-priority.service.ts: same query, same
// inputs and the same lib/utils/scoring.ts formula. Hazard Urgency (rain,
// elevation bounds, the urgency formula and its columns) was removed in
// manuscript revision Phase 1, step 7b — this used to be
// recomputeActiveTicketUrgency and also wrote the Hazard Urgency columns.
export async function recalculateActivePriority() {
  const tickets = await sql<{
    id: number;
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
    SELECT t.id, t.created_at,
      COALESCE(s.severity_rank, 1) AS severity_rank,
      d.active_barangay_count,
      MAX(d.active_barangay_count) OVER ()::int AS max_active_barangay_count
    FROM tickets t
    JOIN barangay_density d ON d.barangay_id = t.barangay_id
    LEFT JOIN severity_by_ticket s ON s.ticket_id = t.id
    WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
  `;

  if (tickets.length === 0) return { updated: 0 };

  const now = new Date();
  const ids: number[] = [];
  const priorityIndices: number[] = [];
  for (const ticket of tickets) {
    ids.push(ticket.id);
    priorityIndices.push(computePriorityIndex({
      severity: severityFromRank(ticket.severity_rank),
      createdAt: ticket.created_at,
      activeBarangayCount: ticket.active_barangay_count,
      maxActiveBarangayCount: ticket.max_active_barangay_count,
      now,
    }));
  }

  await sql`
    UPDATE tickets AS t SET
      priority_index = u.priority_index,
      updated_at = now()
    FROM (
      SELECT * FROM unnest(
        ${ids}::int[],
        ${priorityIndices}::int[]
      ) AS u(id, priority_index)
    ) AS u
    WHERE t.id = u.id
  `;

  return { updated: tickets.length };
}
