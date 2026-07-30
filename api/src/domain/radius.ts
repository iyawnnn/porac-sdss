// Tiered deduplication radius, per PLAN.md §6.
const RADIUS_BY_CATEGORY: Record<string, number> = {
  Pothole: 25,
  'Streetlight Out': 25,
  'Uneven Sidewalk': 25,
  'Clogged Drain': 50,
  'Leaking Pipe': 50,
  Flooding: 100,
};

export function radiusForCategory(category: string): number {
  return RADIUS_BY_CATEGORY[category] ?? 50;
}
