// Query functions (parseTicketQuery, getTicketsForAdmin, getTicketDetail,
// getTicketPriorityContext) were ported to api/src/admin/tickets.service.ts
// (NestJS) — see PLAN blueprint Phase 4/8. This file now only carries the
// row/response shapes that client components still `import type` (they're
// erased at compile time, so keeping them here costs nothing and avoids
// updating every import site to a new path).
import type { PriorityBreakdown } from "@/lib/utils/scoring";
import type { UrgencyLevel } from "@/lib/utils/urgency";

export interface AdminTicketRow {
  id: number;
  category: string;
  title: string | null;
  barangay_id: number;
  barangay_name: string;
  member_count: number;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  urgency_level: UrgencyLevel | null;
  assigned_office: string;
  status: string;
  created_at: string;
  disputed_at: string | null;
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
  highUrgency: number;
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
  member_count: number;
  lat: number;
  lng: number;
  elevation_m: number | null;
  elevation_factor: number | null;
  precipitation_factor: number | null;
  cluster_factor: number | null;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  urgency_level: UrgencyLevel | null;
  resolution_image_url: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  disputed_at: string | null;
  dispute_reason: string | null;
  // Pure function of category, computed server-side at read time — never
  // stored. False means this category is a referral/coordination concern.
  direct_responsibility: boolean;
}

export interface TicketReport {
  id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  elevation_m: number | null;
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
  rain1hMm: number;
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
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
}
