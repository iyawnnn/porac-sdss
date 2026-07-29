// Priority Index (1-100) badge color — a separate axis from urgency_band
// (lib/ui/urgency.ts), so it gets its own scale rather than reusing that
// one. Thirds, no stored thresholds elsewhere to derive from.
export function priorityBandClass(priority: number | null): string {
  if (priority === null) return "bg-line-100 text-ink-500";
  if (priority < 34) return "bg-emerald-100 text-emerald-700";
  if (priority < 67) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
}
