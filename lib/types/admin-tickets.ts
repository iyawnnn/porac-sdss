// Query functions (parseTicketQuery, getTicketsForAdmin, getTicketDetail,
// getTicketPriorityContext) were ported to api/src/admin/tickets.service.ts
// (NestJS) — see PLAN blueprint Phase 4/8. This file now only carries the
// row/response shapes that client components still `import type` (they're
// erased at compile time, so keeping them here costs nothing and avoids
// updating every import site to a new path).
import type { PriorityBreakdown } from "@/lib/utils/scoring";

export interface AdminTicketRow {
  id: number;
  category: string;
  title: string | null;
  barangay_id: number;
  barangay_name: string;
  member_count: number;
  // Operational Priority (1-100). The Hazard Urgency fields were removed from
  // the queue response in manuscript revision Phase 1, step 4.
  priority_index: number | null;
  assigned_office: string;
  status: string;
  created_at: string;
  disputed_at: string | null;
  // Old combined drainage ticket awaiting category correction (migration
  // 0035, handoff Decision 13).
  category_review_required: boolean;
}

export interface PaginatedTickets {
  tickets: AdminTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Counts behind the queue's built-in view tabs, returned alongside the list
// by GET /admin/tickets. Office-scoped to the caller: an MEO officer always
// receives mdrrmo: 0, and the strip hides that tab rather than showing a
// permanent zero. Mirrors TicketViewCounts in api/src/admin/tickets.service.ts.
export interface TicketViewCounts {
  allActive: number;
  disputed: number;
  meo: number;
  mdrrmo: number;
}

// A personal saved filter preset (GET /admin/saved-views). `query` is the raw
// queue querystring; it is replayed through the same URL parsing the address
// bar uses, so a stale preset can never widen office scope.
export interface SavedView {
  id: number;
  name: string;
  query: string;
  position: number;
}

// Outcome of a bulk action. Bulk work loops the single-ticket endpoints, so
// partial success is normal — `skipped` always carries a per-ticket reason
// and must be surfaced to the admin, never discarded.
export interface BulkActionResult {
  ok: number[];
  skipped: { id: number; reason: string }[];
}

export interface TicketDetail {
  id: number;
  category: string;
  barangay_id: number;
  barangay_name: string;
  barangay_geojson: string | null;
  status: string;
  assigned_office: string;
  // Appendix H (manuscript revision Phase 2, step 2b): the office automatic
  // Initial Routing first assigned, and the outcome recorded on resolution
  // (NULL while active and on a Rejected ticket).
  initial_assigned_office: string;
  resolution_outcome: "MUNICIPAL_ACTION_COMPLETED" | "EXTERNAL_REFERRAL" | null;
  member_count: number;
  lat: number;
  lng: number;
  // Operational Priority only since manuscript revision Phase 1, step 5 —
  // the Hazard Urgency fields are no longer in the API response.
  priority_index: number | null;
  resolution_image_url: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  disputed_at: string | null;
  dispute_reason: string | null;
  // Set by migration 0035 on old combined drainage tickets (handoff
  // Decision 13); cleared by the Phase 3 category correction.
  category_review_required: boolean;
  // Pure function of category, computed server-side at read time — never
  // stored. False means this category is a referral/coordination concern.
  direct_responsibility: boolean;
  // Manuscript revision Phase 3, step 3d: set when staff merged this ticket
  // into another; the ticket is then read-only history.
  merged_into_ticket_id: number | null;
}

// Who merged a merged-away ticket into which ticket, when and why (from the
// ticket_merged audit event; manuscript revision Phase 3, step 3d).
export interface TicketMergedInto {
  ticketId: number;
  mergedAt: string | null;
  mergedByName: string | null;
  reason: string | null;
}

// The third decision-support layer (Batch 3) — human-entered, never a
// score/level/band. Mirrors api/src/admin/operational-assessment.service.ts's
// OperationalAssessmentRow (already camelCase from that service's own
// mapping, unlike the raw snake_case ticket/report rows below).
export interface OperationalAssessment {
  id: number;
  ticketId: number;
  assessedByAdminId: number | null;
  assessedByName: string | null;
  observedConditions: string;
  safetyImplications: string;
  operationalConstraints: string[];
  recommendedAction: string;
  temporaryMitigation: string;
  defermentReason: string | null;
  referralReason: string | null;
  remarks: string | null;
  assessedAt: string;
  updatedByAdminId: number | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface TicketReport {
  id: number;
  // Appendix H tracking reference (PRC-YYYY-NNNNNN), the one the citizen sees.
  tracking_reference: string;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  exif_captured_at: string | null;
  exif_data: Record<string, unknown> | null;
  location_mismatch_m: number | null;
  created_at: string;
  flags: string[] | null;
  moderation_status: string | null;
}

export interface TicketStatusHistoryRow {
  status: string;
  admin_name: string | null;
  changed_at: string;
}

// Fetched by GET /admin/tickets/:id but unused by the frontend until now —
// see api/src/admin/tickets.service.ts's getTicketDetail.
export interface TicketReassignmentRow {
  from_office: string;
  to_office: string;
  admin_name: string | null;
  reassigned_at: string;
}

// Historical record only — a referral being recorded does not mean it is
// still unresolved. Never render this as a live "pending" badge; render it
// as a dated history entry ("Referral recorded — ...").
export interface TicketReferralRow {
  agency: string;
  note: string | null;
  admin_name: string;
  referred_at: string;
}

export interface TicketPriorityContext {
  breakdown: PriorityBreakdown;
}

// Formerly defined in app/api/admin/tickets/geo/route.ts (deleted Phase 9)
// — GET /admin/tickets/geo's response shape, consumed by the client-side
// map components that poll it directly.
export interface AdminTicketGeoRow {
  id: number;
  category: string;
  status: string;
  assigned_office: string;
  barangay_name: string;
  // Operational Priority only since manuscript revision Phase 1, step 5.
  priority_index: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
}
