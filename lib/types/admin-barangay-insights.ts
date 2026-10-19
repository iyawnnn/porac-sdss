export interface BarangayInsightRow {
  barangay_id: number;
  barangay_name: string;
  total_tickets: number;
  active_tickets: number;
  resolved_tickets: number;
  top_category: string | null;
  last_activity_at: string | null;
}

export interface BarangayInsightsResponse {
  office: "MEO" | "MDRRMO" | "ALL";
  barangays: BarangayInsightRow[];
}

export interface BarangayInsightKpis {
  total_tickets: number;
  active_tickets: number;
  resolved_tickets: number;
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
  priority_index: number | null;
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
