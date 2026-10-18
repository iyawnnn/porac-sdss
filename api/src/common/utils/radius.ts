// Tiered deduplication radius, per PLAN.md §6. Keys cover both the current
// manuscript-aligned category strings and pre-Phase-3-follow-up legacy ones
// (historical tickets still carry the latter) — unlisted categories fall
// through to the 50m default below.
const RADIUS_BY_CATEGORY: Record<string, number> = {
  // Manuscript-aligned category strings (Phase 3 follow-up).
  'Pothole / Road Surface Damage': 25,
  'Drainage / Culvert / Manhole Issue': 50,
  'Localized Flooding': 100,
  'Landslide / Slope Failure': 100,
  'Lahar / Debris-Flow Threat': 100,
  'Leaking Pipe / Water Supply Concern': 50,
  // Unchanged names, shared by both the legacy and new category sets.
  'Streetlight Out': 25,
  'Uneven Sidewalk': 25,

  // Legacy category strings.
  Pothole: 25,
  'Clogged Drain': 50,
  'Leaking Pipe': 50,
  Flooding: 100,
};

// Since manuscript revision Phase 1, step 3 no API code calls this (automatic
// grouping was removed from ReportsService.submit); only the seed scripts do.
// Kept for Phase 3's suggested-related-ticket candidate search, which moves
// these tiers to the manuscript's 20 / 50 / 100 m (pp. 31, 78) — point
// concerns are still 25 m here until then.
export function radiusForCategory(category: string): number {
  return RADIUS_BY_CATEGORY[category] ?? 50;
}
