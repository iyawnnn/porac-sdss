import { z } from 'zod';
import { MUNICIPALITY } from '../domain/municipality-config';

// Manuscript-aligned category set for NEW submissions (Phase 3 follow-up;
// names and the drainage/manhole split from manuscript revision Phase 2,
// step 2a). "Uncollected Garbage" is deliberately absent — routine
// solid-waste collection is outside direct MEO/MDRRMO responsibility unless
// it's specifically affecting roads/drainage (covered by the Illegal Dumping
// category instead). Historical reports/tickets may still carry any of
// LEGACY_CATEGORIES below; only new submissions are restricted to this list.
export const CATEGORIES = [
  'Pothole / Road Surface Damage',
  'Uneven Sidewalk',
  'Damaged Manhole Cover',
  'Clogged Drainage / Damaged Culvert',
  'Streetlight Out',
  'Localized Flooding',
  'Rain-Induced Slope Failure/Landslide',
  'Lahar or Volcanic Debris-Flow Threat',
  'Fallen Tree or Storm-Related Road Obstruction',
  'Illegal Dumping Affecting Drainage or Road',
  'Overgrown Vegetation Obstructing Road or Signage',
  'Leaking Pipe / Water Supply Concern',
  'Other Minor Infrastructure Hazard',
] as const;

// Retired category strings — no longer offered on the citizen report form,
// but still legitimately stored on historical reports/tickets. Admin-side
// filter/query validation accepts these too (ALL_CATEGORIES below) so old
// records stay findable; new-submission validation (reportSchema below) does
// not. See docs/database.md for the exact legacy -> new semantic mapping.
//
// The first eleven predate the Phase 3 follow-up. The last four were retired
// in manuscript revision Phase 2, step 2a:
// - "Drainage / Culvert / Manhole Issue" was split into "Damaged Manhole
//   Cover" and "Clogged Drainage / Damaged Culvert" (Decision 6). Existing
//   tickets keep it and are marked category_review_required by migration
//   0035, for staff to correct (Decision 13).
// - The other three were renamed to the manuscript wording (Decision 9).
//   Migration 0035 renames them on tickets and saved views; they stay here so
//   reports and audit/notification history that recorded the old text, and
//   old bookmarks, still validate.
export const LEGACY_CATEGORIES = [
  'Flooding',
  'Clogged Drain',
  'Fallen Tree',
  'Pothole',
  'Uneven Sidewalk',
  'Streetlight Out',
  'Leaking Pipe',
  'Uncollected Garbage',
  'Illegal Dumping',
  'Overgrown Vegetation',
  'Other',
  'Drainage / Culvert / Manhole Issue',
  'Landslide / Slope Failure',
  'Lahar / Debris-Flow Threat',
  'Fallen Tree / Storm-Related Obstruction',
] as const;

export const ALL_CATEGORIES = [...CATEGORIES, ...LEGACY_CATEGORIES] as const;

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

// Max-length bounds for admin-side/dispute free-text fields (Issue #48 /
// security-hardening-plan.md R3). Report title/description above already
// bound themselves inline via Zod .max() — these are separate constants
// (even where the numbers happen to match) because those fields sit in
// services with no Zod parsing, just plain if/throw guards.
export const WORK_ORDER_TITLE_MAX_LENGTH = 200;
export const WORK_ORDER_NOTES_MAX_LENGTH = 2000;
export const TICKET_RESOLUTION_NOTES_MAX_LENGTH = 2000;
export const TICKET_DISPUTE_REASON_MAX_LENGTH = 1000;
export const TICKET_REJECTION_REASON_MAX_LENGTH = 1000;
export const MODERATION_NOTE_MAX_LENGTH = 1000;
export const REFERRAL_AGENCY_MAX_LENGTH = 200;
export const REFERRAL_NOTE_MAX_LENGTH = 1000;
export const OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH = 2000;
export const OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH = 1000;
export const OPERATIONAL_ASSESSMENT_REMARKS_MAX_LENGTH = 1000;

// The responsible office's own vocabulary for why a hazard can't simply be
// scheduled and fixed (Batch 3: Operational Assessment) — a fixed tag set,
// not free text, so it stays queryable/filterable later without an NLP
// pass. Deliberately no numeric weight anywhere near this: constraints
// describe reality, they don't score it (see docs/database.md's
// operational_assessments note).
export const OPERATIONAL_CONSTRAINTS = [
  'weather',
  'manpower',
  'equipment',
  'materials',
  'funding',
  'approvals',
  'procurement',
  'jurisdiction',
  'safety',
  'external_coordination',
  'technical_feasibility',
  'other',
] as const;
export type OperationalConstraint = (typeof OPERATIONAL_CONSTRAINTS)[number];

export const reportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(CATEGORIES),
  citizenSeverity: z.enum(SEVERITIES),
  // Sanity range only — the real location gate is ST_Contains against the
  // barangay polygons, not a hardcoded bounding box (see PLAN.md §4.1/§12).
  lat: z.coerce.number().min(MUNICIPALITY.minLat).max(MUNICIPALITY.maxLat),
  lng: z.coerce.number().min(MUNICIPALITY.minLng).max(MUNICIPALITY.maxLng),
});

export type ReportInput = z.infer<typeof reportSchema>;
