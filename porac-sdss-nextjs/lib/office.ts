// Category → office auto-routing, per PLAN.md §10.
const OFFICE_BY_CATEGORY: Record<string, "MEO" | "MDRRMO"> = {
  Flooding: "MDRRMO",
  "Clogged Drain": "MDRRMO",
  "Fallen Tree": "MDRRMO",
  Pothole: "MEO",
  "Uneven Sidewalk": "MEO",
  "Streetlight Out": "MEO",
  "Leaking Pipe": "MEO",
  "Uncollected Garbage": "MEO",
  "Illegal Dumping": "MEO",
  "Overgrown Vegetation": "MEO",
  Other: "MEO",
};

export function officeForCategory(category: string): "MEO" | "MDRRMO" {
  return OFFICE_BY_CATEGORY[category] ?? "MEO";
}
