// Query functions (getMyReports, getMyReportDetail) were ported to
// api/src/reports/reports.service.ts (NestJS) — see PLAN blueprint Phase
// 6/8. This file now only carries the row shapes that client components
// still `import type`.
export interface MyReportRow {
  id: number;
  ticket_id: number;
  title: string;
  category: string;
  citizen_severity: string;
  image_url: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  created_at: string;
  assigned_office: "MEO" | "MDRRMO";
  member_count: number;
  moderation_status: string | null;
  is_merged: boolean;
}

export interface MyReportDetail {
  id: number;
  ticket_id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  category: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  lat: number;
  lng: number;
  citizen_first_name: string;
  citizen_last_name: string;
  created_at: string;
  ticket_created_at: string;
  ticket_updated_at: string;
  assigned_office: "MEO" | "MDRRMO";
  member_count: number;
  moderation_status: string | null;
  moderated_at: string | null;
  resolution_notes: string | null;
  resolution_image_url: string | null;
  disputed_at: string | null;
  resolution_confirmed_at: string | null;
  is_merged: boolean;
}

export interface StatusHistoryStep {
  status: string;
  admin_name: string | null;
  changed_at: string;
}
