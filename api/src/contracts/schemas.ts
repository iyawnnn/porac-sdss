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
