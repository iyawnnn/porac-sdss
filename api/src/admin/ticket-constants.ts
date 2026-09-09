// Pure constants/types — ported from lib/admin/ticketConstants.ts. Next's
// copy stays in place until Phase 9 (client components import it directly).
export type TicketStatus =
  'Reported' | 'Under Review' | 'In Progress' | 'Resolved' | 'Rejected';
// 'priority_desc'/'priority_asc' are legacy key names — they sort by
// t.priority_score (Hazard Urgency) and are preserved verbatim (never
// repurposed) since existing saved views (admin_saved_views.query) may
// already carry them literally in a stored URL querystring; silently
// changing what they mean would silently change those saved views' order.
// 'op_priority_desc'/'op_priority_asc' (Operational Priority / priority_index
// — Batch 4) are the new canonical names and 'op_priority_desc' is now the
// default the queue falls back to when no sort is specified at all.
export type TicketSort =
  | 'priority_desc'
  | 'priority_asc'
  | 'op_priority_desc'
  | 'op_priority_asc'
  | 'newest';

export const TICKET_STATUSES: TicketStatus[] = [
  'Reported',
  'Under Review',
  'In Progress',
  'Resolved',
  'Rejected',
];
export const PAGE_LIMITS = [10, 15, 25, 50] as const;
export const DEFAULT_PAGE_LIMIT = 15;

// Linear status ladder — ported from app/api/admin/tickets/[id]/status/route.ts.
export const NEXT_STATUS: Record<string, TicketStatus> = {
  Reported: 'Under Review',
  'Under Review': 'In Progress',
  'In Progress': 'Resolved',
};

// The 5 real flag prefixes reports.service.ts ever writes (see FLAG
// generation in submit()). Some carry a `:`-delimited suffix
// (DUPLICATE_IMAGE:<reportId>, BOUNDARY_FALLBACK:<name>:<distanceM>) — a
// query filtering "flag type" matches the prefix, not the full string.
export type FlagType =
  | 'LOCATION_MISMATCH'
  | 'STALE_PHOTO'
  | 'NO_EXIF'
  | 'DUPLICATE_IMAGE'
  | 'BOUNDARY_FALLBACK';
export const FLAG_TYPES: FlagType[] = [
  'LOCATION_MISMATCH',
  'STALE_PHOTO',
  'NO_EXIF',
  'DUPLICATE_IMAGE',
  'BOUNDARY_FALLBACK',
];

export type ModerationStatusFilter =
  'pending' | 'quarantined' | 'dismissed' | 'duplicate' | 'all';
export const MODERATION_STATUSES: ModerationStatusFilter[] = [
  'pending',
  'quarantined',
  'dismissed',
  'duplicate',
];
