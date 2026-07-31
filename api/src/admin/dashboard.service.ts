import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

const CRITICAL_PRIORITY_THRESHOLD = 70;

export interface DashboardKpis {
  active_count: number;
  critical_count: number;
  avg_resolution_hours_30d: number | null;
  resolved_24h_count: number;
}

export interface BarangayRiskRow {
  barangay_id: number;
  barangay_name: string;
  active_count: number;
  avg_priority: number | null;
}

export interface CategoryDistributionRow {
  category: string;
  active_count: number;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  private activeStatuses() {
    return this.pg`('Reported', 'Under Review', 'In Progress')`;
  }

  // One round trip, scalar subqueries — same CTE-and-FILTER shape as the
  // resolution-time query this replaces.
  async getDashboardKpis(): Promise<DashboardKpis> {
    const sql = this.pg;
    const activeStatuses = this.activeStatuses();
    const [row] = await sql<DashboardKpis[]>`
      WITH resolved_events AS (
        SELECT t.id, t.created_at, MIN(sh.changed_at) AS resolved_at
        FROM tickets t
        JOIN status_history sh ON sh.ticket_id = t.id AND sh.status = 'Resolved'
        GROUP BY t.id, t.created_at
      )
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status IN ${activeStatuses})::int AS active_count,
        (SELECT COUNT(*) FROM tickets WHERE status IN ${activeStatuses}
          AND priority_index >= ${CRITICAL_PRIORITY_THRESHOLD})::int AS critical_count,
        (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
          FROM resolved_events WHERE resolved_at > now() - interval '30 days') AS avg_resolution_hours_30d,
        (SELECT COUNT(*) FROM resolved_events
          WHERE resolved_at > now() - interval '24 hours')::int AS resolved_24h_count
    `;
    return row;
  }

  async getBarangayRiskRanking(limit = 5): Promise<BarangayRiskRow[]> {
    const sql = this.pg;
    return sql<BarangayRiskRow[]>`
      SELECT b.id AS barangay_id, b.name AS barangay_name,
        COUNT(*)::int AS active_count,
        AVG(t.priority_index)::float8 AS avg_priority
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE t.status IN ${this.activeStatuses()}
      GROUP BY b.id, b.name
      ORDER BY active_count DESC, avg_priority DESC NULLS LAST
      LIMIT ${limit}
    `;
  }

  async getCategoryDistribution(): Promise<CategoryDistributionRow[]> {
    const sql = this.pg;
    return sql<CategoryDistributionRow[]>`
      SELECT category, COUNT(*)::int AS active_count
      FROM tickets
      WHERE status IN ${this.activeStatuses()}
      GROUP BY category
      ORDER BY active_count DESC
    `;
  }
}
