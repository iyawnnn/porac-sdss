// Query functions (getMyReports, getMyReportDetail) were ported to
// api/src/reports/reports.service.ts (NestJS) — see PLAN blueprint Phase
// 6/8. This file now only carries the row shapes that client components
// still `import type`. Neither shape carries a system score: urgency_band
// was removed in manuscript revision Phase 1, step 6c. tracking_reference is
// the Appendix H reference (PRC-YYYY-NNNNNN, manuscript revision Phase 2,
// step 2b).
export interface MyReportRow {
  id: number;
  ticket_id: number;
  tracking_reference: string;
  title: string;
  category: string;
  citizen_severity: string;
  image_url: string;
  status: string;
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
  tracking_reference: string;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  category: string;
  status: string;
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
  // Sourced directly from report_acknowledgments.acknowledged_at — null
  // means Focal (Central Monitoring) has not yet acknowledged this specific
  // report. See ReportTimeline.tsx's "acknowledged" event kind.
  acknowledged_at: string | null;
  is_merged: boolean;
}

export interface StatusHistoryStep {
  status: string;
  admin_name: string | null;
  changed_at: string;
}
