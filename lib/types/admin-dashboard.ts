export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

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

/**
 * Daily point-in-time counts backing the KPI sparklines. Reconstructed
 * server-side from status_history (tickets) and work_order_status_history
 * (work orders) — see api/src/admin/dashboard.service.ts for the honesty
 * caveats, particularly that work-order history only exists from its
 * migration forward.
 */
export interface CountTrendRow {
  date: string;
  count: number;
}

/**
 * One KPI card's week-over-week comparison, computed server-side against a
 * fixed 7-day baseline that does NOT move with the range toggle — see
 * api/src/admin/dashboard.service.ts getKpiDeltas for why, and for the
 * level-vs-flow distinction between the cards.
 *
 * `changePct` is null when the baseline was 0 (a percentage off zero is
 * undefined); render `changeAbs` in that case.
 */
export interface KpiDelta {
  current: number;
  previous: number;
  changeAbs: number;
  changePct: number | null;
}

export interface DashboardDeltas {
  activeTickets: KpiDelta;
  /** null until work_order_status_history reaches back a full week. */
  pendingWorkOrders: KpiDelta | null;
  reports: KpiDelta;
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

export interface OfficePerformanceCounts {
  pendingWorkOrders: number;
  inProgressWorkOrders: number;
  overdueWorkOrders: number;
  completedWorkOrdersThisWeek: number;
  highUrgencyOpenTickets: number;
  flaggedReportsPending: number;
}

export interface OfficePerformanceSummary extends OfficePerformanceCounts {
  scope: "MEO" | "MDRRMO" | "ALL";
  // Populated only for a system admin viewing city-wide (scope: "ALL").
  byOffice: { MEO: OfficePerformanceCounts; MDRRMO: OfficePerformanceCounts } | null;
}

export interface NeedsAttentionWorkOrder {
  id: number;
  ticket_id: number;
  title: string;
  assigned_office: "MEO" | "MDRRMO";
  due_date: string | null;
}

export interface HighUrgencyTicketWithOpenWork {
  id: number;
  category: string;
  assigned_office: "MEO" | "MDRRMO";
  urgency_level: string | null;
  priority_score: number | null;
}

export interface NeedsAttention {
  overdueWorkOrders: NeedsAttentionWorkOrder[];
  dueTodayWorkOrders: NeedsAttentionWorkOrder[];
  highUrgencyTicketsWithOpenWork: HighUrgencyTicketWithOpenWork[];
}