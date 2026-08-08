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