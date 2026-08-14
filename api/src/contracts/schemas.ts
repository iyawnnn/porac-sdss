import { z } from 'zod';
import { MUNICIPALITY } from '../domain/municipality-config';

export const CATEGORIES = [
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
] as const;

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
export const MODERATION_NOTE_MAX_LENGTH = 1000;

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
