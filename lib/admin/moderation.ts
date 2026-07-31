// Query/mutation functions (getModerationQueue, getModerationStats,
// moderateReport) were ported to api/src/admin/moderation.service.ts
// (NestJS) — see PLAN blueprint Phase 4/5/8. This file now only carries
// the row shapes that client components still `import type`.
export interface ModerationQueueRow {
  id: number;
  ticket_id: number;
  title: string;
  citizen_severity: string;
  image_url: string;
  flags: string[];
  location_mismatch_m: number | null;
  exif_captured_at: string | null;
  created_at: string;
  category: string;
  barangay_name: string;
  citizen_id: number;
  citizen_name: string;
  citizen_report_count: number;
  citizen_flag_count: number;
}

export interface ModerationStats {
  pending: number;
  quarantined: number;
  dismissed: number;
  avgResolutionHours: number | null;
}

export type ModerationAction = "dismiss" | "quarantine" | "duplicate";
