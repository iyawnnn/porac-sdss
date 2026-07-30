import { urgencyLevelFromScore } from "@/lib/triage/urgency";

// Priority Index (1-100, severity/age/density model, lib/scoring.ts) badge
// color — a separate axis from priorityScore/urgencyLevel
// (lib/triage/urgency.ts), so it gets its own scale rather than reusing
// that one. Thirds, no stored thresholds elsewhere to derive from.
export function priorityBandClass(priority: number | null): string {
  if (priority === null) return "bg-line-100 text-ink-500";
  if (priority < 34) return "bg-emerald-100 text-emerald-700";
  if (priority < 67) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}

// priorityScore (0-100, lib/triage/urgency.ts) badge color — shares
// urgencyLevelFromScore's thresholds with the URGENCY badge
// (getUrgencyBadgeConfig, lib/ui/urgency.ts) so PRIORITY and URGENCY are
// always in lockstep for a given row.
export function priorityScoreBandClass(priorityScore: number | null): string {
  if (priorityScore === null) return "bg-line-100 text-ink-500";
  const level = urgencyLevelFromScore(priorityScore);
  if (level === "LOW") return "bg-emerald-100 text-emerald-700";
  if (level === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}
