import { sql } from "@/lib/db/raw";

const ACTIVE_STATUSES = sql`('Reported', 'Under Review', 'In Progress')`;

export interface FrequentLocationMetric {
  barangay_name: string;
  active_incidents: number;
}

export interface ResponseTimeMetric {
  barangay_name: string;
  average_response_hours: number | null;
  average_resolution_hours: number | null;
  measured_tickets: number;
}

export interface DepartmentWorkloadMetric {
  office: string;
  active_tickets: number;
  resolved_tickets: number;
}

/** Top mapped, unresolved incidents. `tickets.geom` is the canonical incident point. */
export async function getHighFrequencyLocations() {
  return sql<FrequentLocationMetric[]>`
    SELECT b.name AS barangay_name, COUNT(*)::int AS active_incidents
    FROM tickets t
    JOIN barangays b ON b.id = t.barangay_id
    WHERE t.status IN ${ACTIVE_STATUSES}
      AND t.geom IS NOT NULL
    GROUP BY b.id, b.name
    ORDER BY active_incidents DESC, b.name
    LIMIT 6
  `;
}

/** Response is report creation to first workflow update; resolution is to the first Resolved event. */
export async function getResponseTimeMetrics() {
  return sql<ResponseTimeMetric[]>`
    WITH ticket_events AS (
      SELECT t.id, t.barangay_id, t.created_at,
        MIN(sh.changed_at) FILTER (WHERE sh.status IN ('Under Review', 'In Progress', 'Resolved')) AS first_response_at,
        MIN(sh.changed_at) FILTER (WHERE sh.status = 'Resolved') AS resolved_at
      FROM tickets t
      LEFT JOIN status_history sh ON sh.ticket_id = t.id
      GROUP BY t.id, t.barangay_id, t.created_at
    )
    SELECT b.name AS barangay_name,
      AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600) FILTER (WHERE first_response_at IS NOT NULL) AS average_response_hours,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL) AS average_resolution_hours,
      COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS measured_tickets
    FROM ticket_events te
    JOIN barangays b ON b.id = te.barangay_id
    GROUP BY b.id, b.name
    HAVING COUNT(*) FILTER (WHERE first_response_at IS NOT NULL) > 0
    ORDER BY average_resolution_hours DESC NULLS LAST, average_response_hours DESC NULLS LAST, b.name
  `;
}

export async function getDepartmentWorkload() {
  return sql<DepartmentWorkloadMetric[]>`
    SELECT t.assigned_office::text AS office,
      COUNT(*) FILTER (WHERE t.status IN ${ACTIVE_STATUSES})::int AS active_tickets,
      COUNT(*) FILTER (WHERE t.status = 'Resolved')::int AS resolved_tickets
    FROM tickets t
    GROUP BY t.assigned_office
    ORDER BY active_tickets DESC, office
  `;
}
