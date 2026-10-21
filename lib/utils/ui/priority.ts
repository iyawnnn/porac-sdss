// Operational Priority Index (1-100, severity/age/density model,
// lib/utils/scoring.ts) display band — Operational Priority's OWN scale,
// never derived from the retired Hazard Urgency score. Thirds
// (1-33 Low, 34-66 Medium, 67-100 High): a UI display convention, not a
// manuscript-defined threshold and not stored anywhere. Used by the ticket
// detail page's Priority breakdown and, since manuscript revision Phase 1,
// step 4, by the Ticket Queue's Level column / KPI tile and the dashboard's
// Highest Priority Actions table, and since step 5 by the Ticket Detail
// header and the admin map's marker rings, legend and popup.
export function priorityBandClass(priority: number | null): string {
  if (priority === null) return "bg-line-100 text-ink-500";
  if (priority < 34) return "bg-emerald-100 text-emerald-700";
  if (priority < 67) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

// Solid hex per band for non-Tailwind consumers (Leaflet divIcon inline
// styles on the admin map, manuscript revision Phase 1, step 5). Same hues as
// priorityBandClass's badges (emerald / amber / rose), one step darker so a
// 2px marker ring stays visible on the muted map tiles.
export function priorityBandHex(priority: number | null): string {
  if (priority === null) return "#808c99";
  if (priority < 34) return "#059669";
  if (priority < 67) return "#d97706";
  return "#e11d48";
}

// Text label to pair with priorityBandClass — badges must never be
// color-only (a11y), so every priority badge renders this alongside the score.
export function priorityBandLabel(priority: number | null): string {
  if (priority === null) return "—";
  if (priority < 34) return "Low";
  if (priority < 67) return "Medium";
  return "High";
}
