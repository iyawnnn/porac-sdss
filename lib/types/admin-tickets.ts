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
}

export interface PaginatedTickets {
  tickets: AdminTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
}

export interface TicketStatusHistoryRow {
  status: string;
  admin_name: string | null;
  changed_at: string;
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
