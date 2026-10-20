// Operational Priority Index (1-100, severity/age/density model,
// lib/utils/scoring.ts) display band — Operational Priority's OWN scale,
// never derived from Hazard Urgency's priority_score/urgency_level. Thirds
// (1-33 Low, 34-66 Medium, 67-100 High): a UI display convention, not a
// manuscript-defined threshold and not stored anywhere. Used by the ticket
// detail page's Priority breakdown and, since manuscript revision Phase 1,
// step 4, by the Ticket Queue's Level column / KPI tile and the dashboard's
// Highest Priority Actions table.
export function priorityBandClass(priority: number | null): string {
  if (priority === null) return "bg-line-100 text-ink-500";
  if (priority < 34) return "bg-emerald-100 text-emerald-700";
  if (priority < 67) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

// Text label to pair with priorityBandClass — badges must never be
// color-only (a11y), so every priority badge renders this alongside the score.
export function priorityBandLabel(priority: number | null): string {
  if (priority === null) return "—";
  if (priority < 34) return "Low";
  if (priority < 67) return "Medium";
  return "High";
}
