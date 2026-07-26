import { z } from "zod";

export const CATEGORIES = [
  "Flooding",
  "Clogged Drain",
  "Fallen Tree",
  "Pothole",
  "Uneven Sidewalk",
  "Streetlight Out",
  "Leaking Pipe",
  "Uncollected Garbage",
  "Illegal Dumping",
  "Overgrown Vegetation",
  "Other",
] as const;

export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

export const reportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(CATEGORIES),
  citizenSeverity: z.enum(SEVERITIES),
  // Sanity range only — the real location gate is ST_Contains against the
  // 33 barangay polygons, not a hardcoded bounding box (see PLAN.md §4.1/§12).
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
