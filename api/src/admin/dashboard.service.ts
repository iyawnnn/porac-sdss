import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import {
  HAZARD_APPLICABLE_CATEGORIES,
  hazardContextForCategory,
} from '../common/utils/hazard-information';
import {
  shapeOperationalMetrics,
  type OperationalMetricRow,
} from './dashboard-metrics';
import type { WorkOrderPerformanceCounts } from './work-orders.service';

export const DASHBOARD_RANGE_DAYS = [7, 30, 90] as const;
export type DashboardRangeDays = (typeof DASHBOARD_RANGE_DAYS)[number];

export function parseDashboardRange(value?: string): DashboardRangeDays {
  if (value === undefined) return 30;
  const days = Number(value);
  if (
    !Number.isInteger(days) ||
    !DASHBOARD_RANGE_DAYS.includes(days as DashboardRangeDays)
  ) {
    throw new BadRequestException('range must be one of: 7, 30, 90');
  }
  return days as DashboardRangeDays;
}

export interface DashboardKpis {
  active_count: number;
  reports_this_month_count: number;
  median_resolution_hours_30d: number | null;
}

export interface IncidentTrendRow {
  date: string;
  report_count: number;
}

/** Daily point-in-time counts backing the KPI sparklines. */
export interface CountTrendRow {
  date: string;
  count: number;
}

/**
 * One card's week-over-week comparison. `changePct` is null when the
 * baseline is 0 — a percentage off a zero baseline is undefined, and
 * "+infinity%" is not a number to show an operations team. The UI falls
 * back to `changeAbs` in that case.
 */
export interface KpiDelta {
  current: number;
  previous: number;
  changeAbs: number;
  changePct: number | null;
}

export interface DashboardDeltas {
  activeTickets: KpiDelta;
  /** null until work_order_status_history reaches back to the baseline date. */
  pendingWorkOrders: KpiDelta | null;
  reports: KpiDelta;
}

export interface DistributionRow {
  label: string;
  count: number;
}

export interface CategoryDistributionRow {
  category: string;
  active_count: number;
  active_total: number;
}

// Assembled by DashboardController.officeCounts from two existing
// office-scoped service methods (WorkOrdersService, ModerationService) —
// never a new query path, and never work_orders.notes or any other note
// body. The High-Urgency Open Tickets count was removed in manuscript
// revision Phase 1, step 6a; Operational Priority has no defined levels, so
// nothing replaces it.
export interface OfficePerformanceCounts extends WorkOrderPerformanceCounts {
  flaggedReportsPending: number;
}

export interface OfficePerformanceSummary extends OfficePerformanceCounts {
  scope: 'MEO' | 'MDRRMO';
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  private activeStatuses() {
    return this.pg`('Reported', 'Under Review', 'In Progress')`;
  }

  // Reads no Hazard Urgency column. The high-urgency count was removed in
  // manuscript revision Phase 1, step 6a and is deliberately not replaced
  // by an Operational Priority count: priority_index is a ranking with no
  // manuscript-defined Low/Medium/High levels.
  async getDashboardKpis(office?: 'MEO' | 'MDRRMO'): Promise<DashboardKpis> {
    const sql = this.pg;
    const activeStatuses = this.activeStatuses();
    const [row] = await sql<DashboardKpis[]>`
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status IN ${activeStatuses}
          AND merged_into_ticket_id IS NULL
          AND (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office))::int AS active_count,
        (SELECT COUNT(*) FROM reports r
          WHERE r.created_at >= date_trunc('month', now())
          AND EXISTS (SELECT 1 FROM tickets parent WHERE parent.id=r.ticket_id AND parent.merged_into_ticket_id IS NULL)
          AND (${office ?? null}::text IS NULL OR EXISTS (
            SELECT 1 FROM tickets t WHERE t.id = r.ticket_id AND t.assigned_office = ${office ?? null}::office
          )))::int AS reports_this_month_count,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
          FROM tickets WHERE status = 'Resolved' AND merged_into_ticket_id IS NULL
          AND resolved_at >= now() - interval '30 days' AND resolved_at <= now()
          AND (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office))::float8 AS median_resolution_hours_30d
    `;
    return row;
  }

  /** Ticket units, all-time buckets; fixed rolling 30-day acknowledgment sample. */
  async getOperationalMetrics(office?: 'MEO' | 'MDRRMO') {
    const sql = this.pg;
    const floodCategories = HAZARD_APPLICABLE_CATEGORIES.filter(
      (c) => hazardContextForCategory(c).contextType === 'FLOOD',
    );
    const [row] = await sql<OperationalMetricRow[]>`
      WITH scoped AS (
        SELECT * FROM tickets WHERE merged_into_ticket_id IS NULL
          AND (${office ?? null}::text IS NULL OR assigned_office=${office ?? null}::office)
      ), facts AS (
        SELECT t.*, a.ticket_id AS acknowledged_ticket, a.acknowledged_at,
          h.lookup_status, t.category = ANY(${HAZARD_APPLICABLE_CATEGORIES}::text[]) AS applicable
        FROM scoped t LEFT JOIN acknowledgments a ON a.ticket_id=t.id
        LEFT JOIN hazard_information h ON h.ticket_id=t.id AND h.superseded_at IS NULL
          AND h.hazard_context_type::text = CASE WHEN t.category=ANY(${floodCategories}::text[]) THEN 'FLOOD' ELSE 'RAIN_INDUCED_LANDSLIDE' END
          AND ST_Equals(h.query_geom,t.geom)
      )
      SELECT
        count(*) FILTER (WHERE status IN ('Reported','Under Review','In Progress'))::int AS pending,
        count(*) FILTER (WHERE status='Resolved')::int AS resolved,
        count(*) FILTER (WHERE status='Rejected')::int AS rejected,
        count(*) FILTER (WHERE status='Resolved' AND resolved_at IS NOT NULL AND resolution_outcome='MUNICIPAL_ACTION_COMPLETED')::int AS municipal,
        count(*) FILTER (WHERE status='Resolved' AND resolved_at IS NOT NULL AND resolution_outcome='EXTERNAL_REFERRAL')::int AS referred,
        count(*) FILTER (WHERE status='Resolved' AND (resolved_at IS NULL OR resolution_outcome IS NULL))::int AS legacy,
        count(*) FILTER (WHERE status IN ('Reported','Under Review','In Progress') AND acknowledged_ticket IS NOT NULL)::int AS acknowledged,
        count(*) FILTER (WHERE status IN ('Reported','Under Review','In Progress') AND acknowledged_ticket IS NULL)::int AS awaiting,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (acknowledged_at-created_at))/3600)
          FILTER (WHERE acknowledged_at >= now()-interval '30 days' AND acknowledged_at <= now()))::float8 AS median_ack_hours,
        count(*) FILTER (WHERE applicable AND lookup_status='CLASSIFIED')::int AS classified,
        count(*) FILTER (WHERE applicable AND lookup_status='NO_CLASSIFICATION')::int AS no_classification,
        count(*) FILTER (WHERE applicable AND lookup_status='TEMPORARILY_UNAVAILABLE')::int AS unavailable,
        count(*) FILTER (WHERE applicable AND lookup_status IS NULL)::int AS unchecked
      FROM facts
    `;
    return shapeOperationalMetrics(row);
  }

  async getCategoryDistribution(
    limit = 5,
    office?: 'MEO' | 'MDRRMO',
  ): Promise<CategoryDistributionRow[]> {
    const sql = this.pg;
    return sql<CategoryDistributionRow[]>`
      SELECT category, COUNT(*)::int AS active_count,
        SUM(COUNT(*)) OVER ()::int AS active_total
      FROM tickets
      WHERE status IN ${this.activeStatuses()}
        AND merged_into_ticket_id IS NULL
        AND (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office)
      GROUP BY category
      ORDER BY active_count DESC, category ASC
      LIMIT ${limit}
    `;
  }

  /** Requested calendar dates in the database timezone, including zero-report days. */
  async getIncidentTrend(
    days: DashboardRangeDays = 30,
    office?: 'MEO' | 'MDRRMO',
  ): Promise<IncidentTrendRow[]> {
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
        FROM reports r
        WHERE r.created_at >= (SELECT start_date FROM date_range)
          AND EXISTS (SELECT 1 FROM tickets parent WHERE parent.id=r.ticket_id AND parent.merged_into_ticket_id IS NULL)
          AND (${office ?? null}::text IS NULL OR EXISTS (
            SELECT 1 FROM tickets t WHERE t.id = r.ticket_id AND t.assigned_office = ${office ?? null}::office
          ))
        GROUP BY created_at::date
      )
      SELECT to_char(dates.date, 'YYYY-MM-DD') AS date,
        COALESCE(counts.report_count, 0)::int AS report_count
      FROM dates
      LEFT JOIN counts ON counts.date = dates.date
      ORDER BY dates.date ASC
    `;
  }

  /**
   * Daily count of tickets that were *active* at the end of each calendar
   * date — a genuine reconstruction, not a projection of today's number
   * backwards.
   *
   * A ticket's status on a past date is the most recent status_history row
   * at or before that date. Ticket creation deliberately writes no
   * status_history row (see ReportsService.create — it INSERTs the ticket
   * directly), so a ticket with no history at or before the date is treated
   * as 'Reported', which is the status a ticket is born with. Getting this
   * wrong in the other direction — ignoring pre-history tickets — would
   * silently undercount every date before a ticket's first admin action.
   *
   * Office scoping reads tickets.assigned_office, the ticket's *current*
   * office. Reassignments are tracked separately in office_reassignments and
   * are deliberately not replayed here: the existing active_count KPI this
   * sparkline sits under is also current-office-scoped, and the two must
   * agree on their last data point.
   */
  async getActiveTicketTrend(
    days: DashboardRangeDays = 30,
    office?: 'MEO' | 'MDRRMO',
  ): Promise<CountTrendRow[]> {
    const sql = this.pg;
    return sql<CountTrendRow[]>`
      WITH date_range AS (
        SELECT current_date - (${days}::int - 1) * interval '1 day' AS start_date
      ), dates AS (
        SELECT generate_series(
          date_range.start_date,
          current_date,
          interval '1 day'
        )::date AS date
        FROM date_range
      ), scoped_tickets AS (
        SELECT t.id, t.created_at
        FROM tickets t
        WHERE (${office ?? null}::text IS NULL OR t.assigned_office = ${office ?? null}::office)
          AND t.merged_into_ticket_id IS NULL
      ), status_on_date AS (
        SELECT dates.date,
          st.id,
          COALESCE((
            SELECT sh.status
            FROM status_history sh
            WHERE sh.ticket_id = st.id
              AND sh.changed_at < (dates.date + interval '1 day')
            ORDER BY sh.changed_at DESC, sh.id DESC
            LIMIT 1
          ), 'Reported'::ticket_status) AS status
        FROM dates
        JOIN scoped_tickets st
          ON st.created_at < (dates.date + interval '1 day')
      )
      SELECT to_char(dates.date, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(status_on_date.id) FILTER (
          WHERE status_on_date.status IN ${this.activeStatuses()}
        ), 0)::int AS count
      FROM dates
      LEFT JOIN status_on_date ON status_on_date.date = dates.date
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `;
  }

  /**
   * Daily count of work orders in the 'pending' status at the end of each
   * calendar date, reconstructed from work_order_status_history.
   *
   * Unlike the ticket equivalent above, this genuinely could not be answered
   * before that table existed: work_orders holds only the current status, so
   * a pending -> in_progress transition left no trace of when it happened,
   * and 'cancelled' never sets completed_at, ruling out even a
   * created_at/completed_at approximation.
   *
   * Consequence worth knowing when reading the chart: history only exists
   * from the migration forward. The migration seeds one origin row per
   * pre-existing work order at its created_at with 'pending' (the status
   * every work order is born with), so older work orders are represented
   * rather than dropped — but real transitions that happened before the
   * migration are unrecoverable and are not invented here. Early dates can
   * therefore read high, since a work order completed before the migration
   * still resolves to its seeded 'pending' origin.
   */
  async getPendingWorkOrderTrend(
    days: DashboardRangeDays = 30,
    office?: 'MEO' | 'MDRRMO',
  ): Promise<CountTrendRow[]> {
    const sql = this.pg;
    return sql<CountTrendRow[]>`
      WITH date_range AS (
        SELECT current_date - (${days}::int - 1) * interval '1 day' AS start_date
      ), dates AS (
        SELECT generate_series(
          date_range.start_date,
          current_date,
          interval '1 day'
        )::date AS date
        FROM date_range
      ), scoped_orders AS (
        SELECT wo.id, wo.created_at
        FROM work_orders wo
        WHERE EXISTS (SELECT 1 FROM tickets t WHERE t.id=wo.ticket_id AND t.merged_into_ticket_id IS NULL) AND (${office ?? null}::text IS NULL OR wo.assigned_office = ${office ?? null}::office)
      ), status_on_date AS (
        SELECT dates.date,
          so.id,
          (
            SELECT h.status
            FROM work_order_status_history h
            WHERE h.work_order_id = so.id
              AND h.changed_at < (dates.date + interval '1 day')
            ORDER BY h.changed_at DESC, h.id DESC
            LIMIT 1
          ) AS status
        FROM dates
        JOIN scoped_orders so
          ON so.created_at < (dates.date + interval '1 day')
      )
      SELECT to_char(dates.date, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(status_on_date.id) FILTER (
          WHERE status_on_date.status = 'pending'
        ), 0)::int AS count
      FROM dates
      LEFT JOIN status_on_date ON status_on_date.date = dates.date
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `;
  }

  async getStatusDistribution(
    office?: 'MEO' | 'MDRRMO',
  ): Promise<DistributionRow[]> {
    const sql = this.pg;
    return sql<DistributionRow[]>`
      SELECT status::text AS label, COUNT(*)::int AS count
      FROM tickets
      WHERE (${office ?? null}::text IS NULL OR assigned_office = ${office ?? null}::office)
        AND merged_into_ticket_id IS NULL
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

  async getCitizenSeverityDistribution(
    office?: 'MEO' | 'MDRRMO',
  ): Promise<DistributionRow[]> {
    const sql = this.pg;
    return sql<DistributionRow[]>`
      SELECT citizen_severity AS label, COUNT(*)::int AS count
      FROM reports r
      WHERE r.created_at >= current_date - interval '29 days'
        AND EXISTS (SELECT 1 FROM tickets parent WHERE parent.id=r.ticket_id AND parent.merged_into_ticket_id IS NULL)
          AND (${office ?? null}::text IS NULL OR EXISTS (
          SELECT 1 FROM tickets t WHERE t.id = r.ticket_id AND t.assigned_office = ${office ?? null}::office
        ))
      GROUP BY citizen_severity
      ORDER BY count DESC, label ASC
    `;
  }

  /**
   * Week-over-week comparison for the KPI cards.
   *
   * Deliberately NOT derived from the range-scoped trend series the
   * sparklines already carry. Those are cut to the 7/30/90 toggle, so a
   * delta computed from them would silently mean "vs 89 days ago" at
   * range=90 while still being labelled "last week", and at range=7 the
   * oldest point is only 6 days back so a 7-day baseline does not exist at
   * all. This uses a fixed 7-day baseline that does not move with the
   * toggle.
   *
   * Two different comparisons, because the cards measure two different
   * kinds of quantity:
   *  - Active Tickets and Pending Work Orders are LEVELS (how many stand
   *    open right now), so they compare today's level against the level on
   *    the baseline date, replayed from status history exactly the way the
   *    sparklines are.
   *  - Reports is a FLOW (how many arrived), so it compares the last 7
   *    days' total against the 7 days before that. Comparing a running
   *    total against a point-in-time level would be meaningless.
   *
   * Both report cards (Reports This Month, Incident Reports Over Time) read
   * the single `reports` delta. Their headline numbers differ — month-to-
   * date vs. range total — but both count citizen report submissions, so
   * there is one honest week-over-week number here, not two.
   */
  async getKpiDeltas(office?: 'MEO' | 'MDRRMO'): Promise<DashboardDeltas> {
    const sql = this.pg;
    const activeStatuses = this.activeStatuses();
    const scope = office ?? null;

    const [ticketRows, workOrderRows, reportRows] = await Promise.all([
      sql<{ current: number; previous: number }[]>`
        WITH d(date) AS (VALUES (current_date), (current_date - 7)),
        scoped AS (
          SELECT t.id, t.created_at
          FROM tickets t
          WHERE (${scope}::text IS NULL OR t.assigned_office = ${scope}::office)
            AND t.merged_into_ticket_id IS NULL
        ), status_on AS (
          SELECT d.date, s.id,
            COALESCE((
              SELECT sh.status
              FROM status_history sh
              WHERE sh.ticket_id = s.id
                AND sh.changed_at < (d.date + interval '1 day')
              ORDER BY sh.changed_at DESC, sh.id DESC
              LIMIT 1
            ), 'Reported'::ticket_status) AS status
          FROM d
          JOIN scoped s ON s.created_at < (d.date + interval '1 day')
        )
        SELECT
          COUNT(*) FILTER (WHERE date = current_date AND status IN ${activeStatuses})::int AS current,
          COUNT(*) FILTER (WHERE date = current_date - 7 AND status IN ${activeStatuses})::int AS previous
        FROM status_on
      `,
      // baseline_covered guards the honesty caveat documented on
      // getPendingWorkOrderTrend: work_order_status_history only exists from
      // its migration forward, so before it reaches back a full week the
      // "previous" count is not a real observation. Reported as null rather
      // than as a confident 0% or a swing against a fabricated baseline.
      sql<{ current: number; previous: number; baseline_covered: boolean }[]>`
        WITH d(date) AS (VALUES (current_date), (current_date - 7)),
        scoped AS (
          SELECT wo.id, wo.created_at
          FROM work_orders wo
          WHERE EXISTS (SELECT 1 FROM tickets t WHERE t.id=wo.ticket_id AND t.merged_into_ticket_id IS NULL) AND (${scope}::text IS NULL OR wo.assigned_office = ${scope}::office)
        ), status_on AS (
          SELECT d.date, s.id,
            (
              SELECT h.status
              FROM work_order_status_history h
              WHERE h.work_order_id = s.id
                AND h.changed_at < (d.date + interval '1 day')
              ORDER BY h.changed_at DESC, h.id DESC
              LIMIT 1
            ) AS status
          FROM d
          JOIN scoped s ON s.created_at < (d.date + interval '1 day')
        )
        SELECT
          COUNT(*) FILTER (WHERE date = current_date AND status = 'pending')::int AS current,
          COUNT(*) FILTER (WHERE date = current_date - 7 AND status = 'pending')::int AS previous,
          EXISTS (
            SELECT 1 FROM work_order_status_history
            WHERE changed_at < (current_date - 7 + interval '1 day')
          ) AS baseline_covered
        FROM status_on
      `,
      // Office scoping mirrors reports_this_month_count in getDashboardKpis
      // exactly (EXISTS against the parent ticket), so the delta and the
      // headline it sits under agree on which reports they count.
      sql<{ current: number; previous: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE r.created_at >= current_date - 6)::int AS current,
          COUNT(*) FILTER (WHERE r.created_at >= current_date - 13
            AND r.created_at < current_date - 6)::int AS previous
        FROM reports r
        WHERE r.created_at >= current_date - 13
          AND EXISTS (SELECT 1 FROM tickets parent WHERE parent.id=r.ticket_id AND parent.merged_into_ticket_id IS NULL)
          AND (${scope}::text IS NULL OR EXISTS (
            SELECT 1 FROM tickets t WHERE t.id = r.ticket_id AND t.assigned_office = ${scope}::office
          ))
      `,
    ]);

    const workOrder = workOrderRows[0];
    return {
      activeTickets: toKpiDelta(
        ticketRows[0]?.current ?? 0,
        ticketRows[0]?.previous ?? 0,
      ),
      pendingWorkOrders: workOrder?.baseline_covered
        ? toKpiDelta(workOrder.current, workOrder.previous)
        : null,
      reports: toKpiDelta(
        reportRows[0]?.current ?? 0,
        reportRows[0]?.previous ?? 0,
      ),
    };
  }
}

export function toKpiDelta(current: number, previous: number): KpiDelta {
  const changeAbs = current - previous;
  return {
    current,
    previous,
    changeAbs,
    // Rounded here rather than in the UI so every consumer (card, future
    // CSV export, tests) reads the same number.
    changePct:
      previous === 0 ? null : Math.round((changeAbs / previous) * 1000) / 10,
  };
}
