import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

const HIGH_URGENCY_LEVEL = 'HIGH';
export const DASHBOARD_RANGE_DAYS = [7, 30, 90] as const;
export type DashboardRangeDays = (typeof DASHBOARD_RANGE_DAYS)[number];

export function parseDashboardRange(value?: string): DashboardRangeDays {
  if (value === undefined) return 30;
  const days = Number(value);
  if (!Number.isInteger(days) || !DASHBOARD_RANGE_DAYS.includes(days as DashboardRangeDays)) {
    throw new BadRequestException('range must be one of: 7, 30, 90');
  }
  return days as DashboardRangeDays;
}

export interface DashboardKpis {
  active_count: number;
  high_urgency_count: number;
  reports_this_month_count: number;
  avg_resolution_hours_30d: number | null;
}

export interface IncidentTrendRow {
  date: string;
  report_count: number;
}

export interface DistributionRow {
  label: string;
  count: number;
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
  active_total: number;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  private activeStatuses() {
    return this.pg`('Reported', 'Under Review', 'In Progress')`;
  }

  // "High urgency" follows the persisted urgency_level created by the
  // existing scoring pipeline; it intentionally does not repurpose the
  // separate workflow priority_index.
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
          AND urgency_level = ${HIGH_URGENCY_LEVEL})::int AS high_urgency_count,
        (SELECT COUNT(*) FROM reports
          WHERE created_at >= date_trunc('month', now()))::int AS reports_this_month_count,
        (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
          FROM resolved_events WHERE resolved_at > now() - interval '30 days') AS avg_resolution_hours_30d
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
      ORDER BY active_count DESC, avg_priority DESC NULLS LAST, b.name ASC
      LIMIT ${limit}
    `;
  }

  async getCategoryDistribution(limit = 5): Promise<CategoryDistributionRow[]> {
    const sql = this.pg;
    return sql<CategoryDistributionRow[]>`
      SELECT category, COUNT(*)::int AS active_count,
        SUM(COUNT(*)) OVER ()::int AS active_total
      FROM tickets
      WHERE status IN ${this.activeStatuses()}
      GROUP BY category
      ORDER BY active_count DESC, category ASC
      LIMIT ${limit}
    `;
  }

  /** Requested calendar dates in the database timezone, including zero-report days. */
  async getIncidentTrend(days: DashboardRangeDays = 30): Promise<IncidentTrendRow[]> {
    const sql = this.pg;
    return sql<IncidentTrendRow[]>`
      WITH date_range AS (
        SELECT current_date - (${days}::int - 1) * interval '1 day' AS start_date
      ), dates AS (
        SELECT generate_series(
          date_range.start_date,
          current_date,
          interval '1 day'
        )::date AS date
        FROM date_range
      ), counts AS (
        SELECT created_at::date AS date, COUNT(*)::int AS report_count
        FROM reports
        WHERE created_at >= (SELECT start_date FROM date_range)
        GROUP BY created_at::date
      )
      SELECT to_char(dates.date, 'YYYY-MM-DD') AS date,
        COALESCE(counts.report_count, 0)::int AS report_count
      FROM dates
      LEFT JOIN counts ON counts.date = dates.date
      ORDER BY dates.date ASC
    `;
  }

  async getStatusDistribution(): Promise<DistributionRow[]> {
    const sql = this.pg;
    return sql<DistributionRow[]>`
      SELECT status::text AS label, COUNT(*)::int AS count
      FROM tickets
      GROUP BY status
      ORDER BY CASE status
        WHEN 'Reported' THEN 1
        WHEN 'Under Review' THEN 2
        WHEN 'In Progress' THEN 3
        WHEN 'Resolved' THEN 4
        WHEN 'Rejected' THEN 5
        ELSE 6
      END
    `;
  }

  // assigned_office is NOT NULL. VALUES deliberately includes both supported
  // offices so a temporarily empty queue is represented as zero rather than
  // silently disappearing from the workload card.
  async getDepartmentWorkload(): Promise<DistributionRow[]> {
    const sql = this.pg;
    return sql<DistributionRow[]>`
      WITH offices(label) AS (VALUES ('MEO'::text), ('MDRRMO'::text))
      SELECT offices.label, COUNT(t.id)::int AS count
      FROM offices
      LEFT JOIN tickets t
        ON t.assigned_office::text = offices.label
        AND t.status IN ${this.activeStatuses()}
      GROUP BY offices.label
      ORDER BY CASE offices.label WHEN 'MEO' THEN 1 ELSE 2 END
    `;
  }

  async getCitizenSeverityDistribution(): Promise<DistributionRow[]> {
    const sql = this.pg;
    return sql<DistributionRow[]>`
      SELECT citizen_severity AS label, COUNT(*)::int AS count
      FROM reports
      WHERE created_at >= current_date - interval '29 days'
      GROUP BY citizen_severity
      ORDER BY count DESC, label ASC
    `;
  }
}
