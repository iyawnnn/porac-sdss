// Operational Priority Index (1-100, severity/age/density model,
// lib/scoring.ts) badge color — a separate axis from priority_score/
// urgencyLevel (lib/triage/urgency.ts), so it gets its own scale rather
// than reusing that one. Thirds, no stored thresholds elsewhere to derive
// from. Not the Hazard Urgency Score/Level shown on the Ticket Queue table
// (see lib/utils/ui/urgency.ts) — this renders only on the ticket detail
// page's Priority breakdown.
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
