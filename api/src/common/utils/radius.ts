import type { ALL_CATEGORIES } from '../../contracts/schemas';

// Search radius for suggested related tickets (manuscript pp. 31 and 78;
// manuscript revision Phase 3, step 3c): 20 m for point defects, 50 m for
// linear or local defects, 100 m for area hazards. Categories the manuscript
// does not name are the group's classification. Every legacy name
// (LEGACY_CATEGORIES) has the radius of its current name, and the Record type
// makes every current and legacy category an explicit entry (radius.spec.ts
// checks it too). Any other string falls back to DEFAULT_RADIUS_M.
export const RADIUS_BY_CATEGORY: Record<
  (typeof ALL_CATEGORIES)[number],
  20 | 50 | 100
> = {
  // 20 m
  'Pothole / Road Surface Damage': 20,
  'Streetlight Out': 20,
  'Damaged Manhole Cover': 20,
  // 50 m
  'Clogged Drainage / Damaged Culvert': 50,
  'Uneven Sidewalk': 50,
  'Fallen Tree or Storm-Related Road Obstruction': 50,
  'Overgrown Vegetation Obstructing Road or Signage': 50,
  'Illegal Dumping Affecting Drainage or Road': 50,
  'Leaking Pipe / Water Supply Concern': 50,
  'Other Minor Infrastructure Hazard': 50,
  // 100 m
  'Localized Flooding': 100,
  'Rain-Induced Slope Failure/Landslide': 100,
  'Lahar or Volcanic Debris-Flow Threat': 100,

  // Legacy names, at their current name's radius. 'Uneven Sidewalk' and
  // 'Streetlight Out' kept their names and are listed above.
  Pothole: 20,
  'Clogged Drain': 50,
  Flooding: 100,
  'Fallen Tree': 50,
  'Leaking Pipe': 50,
  'Illegal Dumping': 50,
  'Overgrown Vegetation': 50,
  Other: 50,
  // No current name; Illegal Dumping Affecting Drainage or Road covers its
  // road and drainage cases.
  'Uncollected Garbage': 50,
  // Split into Damaged Manhole Cover (20 m) and Clogged Drainage / Damaged
  // Culvert (50 m) (Decision 6). These tickets await category review, so
  // they keep the wider radius, which is also what they had before.
  'Drainage / Culvert / Manhole Issue': 50,
  'Landslide / Slope Failure': 100,
  'Lahar / Debris-Flow Threat': 100,
  'Fallen Tree / Storm-Related Obstruction': 50,
};

export const DEFAULT_RADIUS_M = 50;

// Used by RelatedTicketsService (the related-ticket candidate search) and by
// two seed scripts.
export function radiusForCategory(category: string): number {
  return Object.hasOwn(RADIUS_BY_CATEGORY, category)
    ? RADIUS_BY_CATEGORY[category as keyof typeof RADIUS_BY_CATEGORY]
    : DEFAULT_RADIUS_M;
}
