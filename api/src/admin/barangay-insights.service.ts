import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

const TREND_DAYS = 30;
const RECENT_TICKETS_LIMIT = 10;
const HIGH_URGENCY_LEVEL = 'HIGH';

export interface BarangayInsightRow {
  barangay_id: number;
  barangay_name: string;
  total_tickets: number;
  active_tickets: number;
  resolved_tickets: number;
  high_urgency_tickets: number;
  top_category: string | null;
  last_activity_at: string | null;
}

export interface BarangayInsightKpis {
  total_tickets: number;
  active_tickets: number;
  resolved_tickets: number;
  high_urgency_tickets: number;
}

export interface BarangayCategoryRow {
  category: string;
  count: number;
}

export interface BarangayTrendRow {
  date: string;
  ticket_count: number;
}

export interface BarangayElevationSummary {
  elevation_min: number | null;
  elevation_avg: number | null;
  elevation_max: number | null;
}

export interface BarangayRecentTicketRow {
  id: number;
  category: string;
  title: string | null;
  status: string;
  urgency_level: string | null;
  priority_score: number | null;
  member_count: number;
  created_at: string;
}

export interface BarangayProfile {
  barangay_id: number;
  barangay_name: string;
  kpis: BarangayInsightKpis;
  categoryBreakdown: BarangayCategoryRow[];
  incidentTrend: BarangayTrendRow[];
  elevation: BarangayElevationSummary;
  recentTickets: BarangayRecentTicketRow[];
}

// Read-only aggregates over tickets/reports/dem_points, all raw-PG since
// they join against barangays.geom / dem_points.geom (two-ORM rule, see
// CLAUDE.md). Every query here follows the exact office-scoping shape
// DashboardService already uses ((office ?? null)::text IS NULL OR ...) —
// no new authorization logic, just the same clamp applied to a barangay
// grouping instead of a flat count. Never selects work_orders.notes or any
// other note body (this service never touches work_orders at all).
@Injectable()
export class BarangayInsightsService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  private activeStatuses() {
    return this.pg`('Reported', 'Under Review', 'In Progress')`;
  }

  // LEFT JOIN (with the office filter moved into the JOIN condition, not a
  // WHERE clause) keeps all 29 barangays in the result even when a barangay
  // has zero tickets for the scoped office — a WHERE clause would silently
  // drop those rows instead of showing them as zero.
  async listInsights(office?: 'MEO' | 'MDRRMO'): Promise<BarangayInsightRow[]> {
    const sql = this.pg;
    return sql<BarangayInsightRow[]>`
      SELECT b.id AS barangay_id, b.name AS barangay_name,
        COUNT(t.id)::int AS total_tickets,
        COUNT(t.id) FILTER (WHERE t.status IN ${this.activeStatuses()})::int AS active_tickets,
        COUNT(t.id) FILTER (WHERE t.status = 'Resolved')::int AS resolved_tickets,
        COUNT(t.id) FILTER (WHERE t.urgency_level = ${HIGH_URGENCY_LEVEL})::int AS high_urgency_tickets,
        MAX(t.updated_at) AS last_activity_at,
        (
          SELECT t2.category FROM tickets t2
          WHERE t2.barangay_id = b.id
            AND (${office ?? null}::text IS NULL OR t2.assigned_office = ${office ?? null}::office)
          GROUP BY t2.category
          ORDER BY COUNT(*) DESC, t2.category ASC
          LIMIT 1
        ) AS top_category
      FROM barangays b
      LEFT JOIN tickets t ON t.barangay_id = b.id
        AND (${office ?? null}::text IS NULL OR t.assigned_office = ${office ?? null}::office)
      GROUP BY b.id, b.name
      ORDER BY b.name ASC
    `;
  }

  async getProfile(barangayId: number, office?: 'MEO' | 'MDRRMO'): Promise<BarangayProfile> {
    const sql = this.pg;
    const [barangay] = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM barangays WHERE id = ${barangayId}
    `;
    if (!barangay) throw new NotFoundException('Barangay not found.');

    const [[kpis], categoryBreakdown, incidentTrend, [elevation], recentTickets] = await Promise.all([
      sql<BarangayInsightKpis[]>`
        SELECT
          COUNT(*)::int AS total_tickets,
          COUNT(*) FILTER (WHERE status IN ${this.activeStatuses()})::int AS active_tickets,
          COUNT(*) FILTER (WHERE status = 'Resolved')::int AS resolved_tickets,
          COUNT(*) FILTER (WHERE urgency_level = ${HIGH_URGENCY_LEVEL})::int AS high_urgency_tickets
        FROM tickets
        WHERE barangay_id = ${barangayId}
          AND (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office)
      `,
      sql<BarangayCategoryRow[]>`
        SELECT category, COUNT(*)::int AS count
        FROM tickets
        WHERE barangay_id = ${barangayId}
          AND (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office)
        GROUP BY category
        ORDER BY count DESC, category ASC
      `,
      // Same shape as DashboardService.getIncidentTrend (generate_series
      // zero-fill), scoped to one barangay and ticket creation rather than
      // report creation, since this page is ticket-centric throughout.
      sql<BarangayTrendRow[]>`
        WITH dates AS (
          SELECT generate_series(
            current_date - (${TREND_DAYS}::int - 1) * interval '1 day',
            current_date,
            interval '1 day'
          )::date AS date
        ), counts AS (
          SELECT t.created_at::date AS date, COUNT(*)::int AS ticket_count
          FROM tickets t
          WHERE t.barangay_id = ${barangayId}
            AND t.created_at >= current_date - (${TREND_DAYS}::int - 1) * interval '1 day'
            AND (${office ?? null}::text IS NULL OR t.assigned_office = ${office ?? null}::office)
          GROUP BY t.created_at::date
        )
        SELECT to_char(dates.date, 'YYYY-MM-DD') AS date,
          COALESCE(counts.ticket_count, 0)::int AS ticket_count
        FROM dates
        LEFT JOIN counts ON counts.date = dates.date
        ORDER BY dates.date ASC
      `,
      // Display-only elevation summary — dem_points is never used to filter
      // tickets/barangays here, only to describe one barangay's terrain.
      sql<BarangayElevationSummary[]>`
        SELECT MIN(d.elevation_m)::float8 AS elevation_min,
          AVG(d.elevation_m)::float8 AS elevation_avg,
          MAX(d.elevation_m)::float8 AS elevation_max
        FROM dem_points d
        JOIN barangays b ON ST_Contains(b.geom, d.geom)
        WHERE b.id = ${barangayId}
      `,
      sql<BarangayRecentTicketRow[]>`
        SELECT t.id, t.category,
          (SELECT r.title FROM reports r WHERE r.ticket_id = t.id ORDER BY r.created_at ASC, r.id ASC LIMIT 1) AS title,
          t.status, t.urgency_level, t.priority_score, t.member_count, t.created_at
        FROM tickets t
        WHERE t.barangay_id = ${barangayId}
          AND (${office ?? null}::text IS NULL OR t.assigned_office = ${office ?? null}::office)
        ORDER BY t.created_at DESC
        LIMIT ${RECENT_TICKETS_LIMIT}
      `,
    ]);

    return {
      barangay_id: barangay.id,
      barangay_name: barangay.name,
      kpis: kpis ?? { total_tickets: 0, active_tickets: 0, resolved_tickets: 0, high_urgency_tickets: 0 },
      categoryBreakdown,
      incidentTrend,
      elevation: elevation ?? { elevation_min: null, elevation_avg: null, elevation_max: null },
      recentTickets,
    };
  }
}
