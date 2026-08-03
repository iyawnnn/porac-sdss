// Query/mutation functions (getModerationQueue, getModerationStats,
// moderateReport) were ported to api/src/admin/moderation.service.ts
// (NestJS) — see PLAN blueprint Phase 4/5/8. This file now only carries
// the row/response shapes that client components still `import type`.
export interface ModerationQueueRow {
  id: number;
  ticket_id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  flags: string[];
  location_mismatch_m: number | null;
  exif_captured_at: string | null;
  created_at: string;
  category: string;
  barangay_name: string;
  barangay_id: number;
  assigned_office: "MEO" | "MDRRMO";
  citizen_id: number;
  citizen_name: string;
  citizen_report_count: number;
  citizen_flag_count: number;
  moderation_status: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
}

export interface PaginatedModeration {
  reports: ModerationQueueRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ModerationStats {
  pending: number;
  quarantined: number;
  dismissed: number;
  duplicate: number;
  avgResolutionHours: number | null;
}

export type ModerationAction = "dismiss" | "quarantine" | "duplicate";

export type ModerationStatusFilter = "pending" | "quarantined" | "dismissed" | "duplicate" | "all";
export const MODERATION_STATUSES: ModerationStatusFilter[] = ["pending", "quarantined", "dismissed", "duplicate"];

export type FlagType = "LOCATION_MISMATCH" | "STALE_PHOTO" | "NO_EXIF" | "DUPLICATE_IMAGE" | "BOUNDARY_FALLBACK";
export const FLAG_TYPES: FlagType[] = ["LOCATION_MISMATCH", "STALE_PHOTO", "NO_EXIF", "DUPLICATE_IMAGE", "BOUNDARY_FALLBACK"];
