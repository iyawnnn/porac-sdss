import { z } from "zod";
import { MUNICIPALITY } from "@/lib/municipality-config";

// Manuscript-aligned category set for NEW submissions (Phase 3 follow-up) —
// mirrors api/src/contracts/schemas.ts's CATEGORIES exactly. "Uncollected
// Garbage" is deliberately absent; see that file's comment for why.
export const CATEGORIES = [
  "Pothole / Road Surface Damage",
  "Uneven Sidewalk",
  "Damaged Manhole Cover",
  "Clogged Drainage / Damaged Culvert",
  "Streetlight Out",
  "Localized Flooding",
  "Rain-Induced Slope Failure/Landslide",
  "Lahar or Volcanic Debris-Flow Threat",
  "Fallen Tree or Storm-Related Road Obstruction",
  "Illegal Dumping Affecting Drainage or Road",
  "Overgrown Vegetation Obstructing Road or Signage",
  "Leaking Pipe / Water Supply Concern",
  "Other Minor Infrastructure Hazard",
] as const;

export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

// The manuscript's description of each severity level, shown beside it on
// the citizen report form (manuscript revision Phase 3, step 3a). Guidance
// only: the stored value is still the level name.
export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  Low: "Minor impact. Normal access or use is mostly unaffected.",
  Medium: "Noticeable impact. Access or use is still possible with caution.",
  High: "Major disruption or a clear safety concern.",
  Critical: "Immediate serious danger, or the area or service is effectively blocked or unusable.",
};

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
