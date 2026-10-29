import { Inject, Injectable } from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';
import { PG } from '../db/db.module';
import { computePriorityIndex } from '../common/utils/scoring';
import { ticketSeverity } from '../common/utils/severity';

export interface OperationalPriorityRecalcResult {
  updated: number;
}

// One active ticket's inputs to the formula, as the recalculation reads them.
export interface PriorityInputRow {
  id: number;
  created_at: string;
  priority_index: number | null;
  // citizen_severity of every report linked to the ticket, oldest first.
  member_severities: string[];
  active_barangay_count: number;
  max_active_barangay_count: number;
}

// Operational Priority (tickets.priority_index, 1-100) — the manuscript's
// administrative queue order:
//   0.50 * severity + 0.25 * age (capped at 7 days) + 0.25 * barangay demand
// The formula itself lives in common/utils/scoring.ts and is unchanged.
//
// Phase 1, step 1: this used to be computed and written inside the Hazard
// Urgency recompute (RecomputeService, deleted in step 7a). It became its
// own service so Hazard Urgency could be removed without touching the queue
// order. It reads and writes ONLY
// priority_index — never priority_score, urgency_score, urgency_band,
// urgency_level or any *_factor column.
//
// Only active tickets (Reported / Under Review / In Progress) are
// recalculated; Resolved/Rejected tickets keep their last value, same as
// before the split. A ticket merged into another (manuscript revision Phase
// 3, step 3d) is neither recalculated nor counted in barangay demand: it
// keeps its old status as history but is no longer an open ticket.
//
// Severity (manuscript pp. 73–74; manuscript revision Phase 4, step 4a) is
// the MEDIAN Severity Factor of the ticket's member reports — every report
// linked to it (common/utils/severity.ts) — used as an exact number. It
// replaced the old MAX rule.
@Injectable()
export class OperationalPriorityService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  // Every active ticket. Run after a change commits (it touches every active
  // ticket, so it never runs inside another write's transaction), on admin
  // reads and by the daily cron.
  async recalculateActiveTickets(): Promise<OperationalPriorityRecalcResult> {
    return this.write(this.pg, await this.readInputs(this.pg, null));
  }

  // Only the given tickets, inside the caller's transaction: the tickets
  // whose membership or location the transaction just changed, so their
  // severity and priority commit together with the change. The caller
  // already holds their row locks. Barangay demand is still measured over
  // every active ticket. recalculateActiveTickets still runs after the
  // commit for every other ticket whose demand may have moved.
  async recalculateTickets(
    tx: TransactionSql,
    ticketIds: number[],
  ): Promise<OperationalPriorityRecalcResult> {
    if (ticketIds.length === 0) return { updated: 0 };
    return this.write(tx, await this.readInputs(tx, ticketIds));
  }

  // ticketIds null = every active ticket.
  async readInputs(
    client: Sql | TransactionSql,
    ticketIds: number[] | null,
  ): Promise<PriorityInputRow[]> {
    const sql = client as Sql;
    return sql<PriorityInputRow[]>`
      WITH barangay_density AS (
        SELECT barangay_id, COUNT(*)::int AS active_barangay_count
        FROM tickets
        WHERE status IN ('Reported', 'Under Review', 'In Progress')
          AND merged_into_ticket_id IS NULL
        GROUP BY barangay_id
      ), severities_by_ticket AS (
        SELECT ticket_id, array_agg(citizen_severity ORDER BY created_at, id) AS member_severities
        FROM reports
        WHERE ${ticketIds}::int[] IS NULL OR ticket_id = ANY(${ticketIds}::int[])
        GROUP BY ticket_id
      )
      SELECT t.id, t.created_at, t.priority_index,
        COALESCE(s.member_severities, ARRAY[]::text[]) AS member_severities,
        d.active_barangay_count,
        (SELECT MAX(active_barangay_count) FROM barangay_density)::int AS max_active_barangay_count
      FROM tickets t
      JOIN barangay_density d ON d.barangay_id = t.barangay_id
      LEFT JOIN severities_by_ticket s ON s.ticket_id = t.id
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
        AND t.merged_into_ticket_id IS NULL
        AND (${ticketIds}::int[] IS NULL OR t.id = ANY(${ticketIds}::int[]))
    `;
  }

  private async write(
    client: Sql | TransactionSql,
    tickets: PriorityInputRow[],
  ): Promise<OperationalPriorityRecalcResult> {
    if (tickets.length === 0) return { updated: 0 };

    const now = new Date();
    const ids: number[] = [];
    const priorityIndices: number[] = [];
    for (const ticket of tickets) {
      ids.push(ticket.id);
      priorityIndices.push(priorityIndexFor(ticket, now));
    }

    const sql = client as Sql;
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

// The one place a ticket's inputs become its priority_index (also used by
// api/scripts/recalculate-median-severity.ts).
export function priorityIndexFor(ticket: PriorityInputRow, now: Date): number {
  const severity = ticketSeverity(ticket.member_severities);
  return computePriorityIndex({
    severity: severity.label,
    severityFactor: severity.factor,
    createdAt: ticket.created_at,
    activeBarangayCount: ticket.active_barangay_count,
    maxActiveBarangayCount: ticket.max_active_barangay_count,
    now,
  });
}
