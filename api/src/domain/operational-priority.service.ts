import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import {
  computePriorityIndex,
  severityFromRank,
} from '../common/utils/scoring';

export interface OperationalPriorityRecalcResult {
  updated: number;
}

// Operational Priority (tickets.priority_index, 1-100) — the manuscript's
// administrative queue order:
//   0.50 * severity + 0.25 * age (capped at 7 days) + 0.25 * barangay demand
// The formula itself lives in common/utils/scoring.ts and is unchanged.
//
// Phase 1, step 1: this used to be computed and written inside
// RecomputeService.recomputeActiveTicketUrgency(), coupled to the Hazard
// Urgency update. It is now its own service so Hazard Urgency can be removed
// later without touching the queue order. It reads and writes ONLY
// priority_index — never priority_score, urgency_score, urgency_band,
// urgency_level or any *_factor column.
//
// Only active tickets (Reported / Under Review / In Progress) are
// recalculated; Resolved/Rejected tickets keep their last value, same as
// before the split.
//
// Severity is still the MAX citizen_severity across the ticket's linked
// reports (same rank mapping as before). The median rule is a later phase.
@Injectable()
export class OperationalPriorityService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  async recalculateActiveTickets(): Promise<OperationalPriorityRecalcResult> {
    const sql = this.pg;

    const tickets = await sql<
      {
        id: number;
        created_at: string;
        severity_rank: number;
        active_barangay_count: number;
        max_active_barangay_count: number;
      }[]
    >`
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
      priorityIndices.push(
        computePriorityIndex({
          severity: severityFromRank(ticket.severity_rank),
          createdAt: ticket.created_at,
          activeBarangayCount: ticket.active_barangay_count,
          maxActiveBarangayCount: ticket.max_active_barangay_count,
          now,
        }),
      );
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
}
