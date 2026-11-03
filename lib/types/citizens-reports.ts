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

// The citizen's own one-time, locked answer on a resolved ticket.
export interface MyResolutionFeedback {
  feedback_type: "CONFIRMED" | "DISPUTED";
  reason: string | null;
  created_at: string;
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
  // When the ticket was last resolved (manuscript revision Phase 5, step
  // 5c); null on a legacy Resolved ticket, where the page falls back to
  // ticket_updated_at.
  resolved_at: string | null;
  // The resolution outcome in citizen terms (manuscript revision Phase 6,
  // step 6b), mapped on the server; null unless the ticket is Resolved with
  // a resolution record — a legacy Resolved ticket shows a neutral
  // "Resolved". See lib/utils/citizen-report-copy.ts outcomeCopy.
  outcome: CitizenOutcome | null;
  // This citizen's own resolution feedback (manuscript revision Phase 3,
  // step 3g), null until they answer. Never another citizen's answer.
  my_feedback: MyResolutionFeedback | null;
  // When municipal monitoring acknowledged the issue (step 6b): the
  // earliest of this report's own acknowledgment and the ticket-level
  // acknowledgment of its ticket (or of the ticket a merge moved it from).
  // Null until acknowledged. See ReportTimeline.tsx's "acknowledged" event.
  acknowledged_at: string | null;
  // True when this report joined an existing ticket (a staff merge moved it,
  // or the legacy automatic merge), with when it joined.
  is_merged: boolean;
  merged_at: string | null;
  // The other reports on the same ticket, never their references.
  other_reports_count: number;
  // Manuscript revision Phase 3, step 3e: the category the citizen picked
  // (category above is the ticket's current one, which staff may have
  // corrected), and the ticket's current location only when staff
  // corrected it (null otherwise, so another citizen's pin on a shared
  // ticket is never sent).
  submitted_category: string;
  corrected_lat: number | null;
  corrected_lng: number | null;
}

// The citizen's resolution outcome keys (api/src/reports/citizen-report-view.ts).
export type CitizenOutcome = "HANDLED_BY_MUNICIPALITY" | "REFERRED_OUTSIDE";

// One status change on the citizen's ticket (manuscript revision Phase 6,
// step 6b): no staff name, no reason. returned marks a Resolved -> Under
// Review step, shown as "Back under review".
export interface StatusHistoryStep {
  status: string;
  changed_at: string;
  returned: boolean;
}

// A referral to an outside agency: the agency (a suggested agency by name,
// otherwise "an outside agency") and the date — never the staff reason.
export interface CitizenReferral {
  agency: string;
  referred_at: string;
}

// GET /reports/mine/:id.
export interface MyReportDetailResponse {
  report: MyReportDetail;
  history: StatusHistoryStep[];
  referrals: CitizenReferral[];
}
