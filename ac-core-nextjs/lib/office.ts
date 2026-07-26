// Category → office auto-routing, per PLAN.md §10.
const OFFICE_BY_CATEGORY: Record<string, "CEO" | "ACDRRMO"> = {
  Flooding: "ACDRRMO",
  "Clogged Drain": "ACDRRMO",
  "Fallen Tree": "ACDRRMO",
  Pothole: "CEO",
  "Uneven Sidewalk": "CEO",
  "Streetlight Out": "CEO",
  "Leaking Pipe": "CEO",
  "Uncollected Garbage": "CEO",
  "Illegal Dumping": "CEO",
  "Overgrown Vegetation": "CEO",
  Other: "CEO",
};

export function officeForCategory(category: string): "CEO" | "ACDRRMO" {
  return OFFICE_BY_CATEGORY[category] ?? "CEO";
}
