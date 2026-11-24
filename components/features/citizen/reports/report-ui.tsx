import { getCategoryMarkerSpec, glyphColor } from "@/lib/gis/category-spec";
import type { MyReportsPage } from "@/lib/types/citizens-reports";
import { REPORT_STATUS_FALLBACK, REPORT_STATUS_STYLE } from "@/components/features/citizen/dashboard/reportStatusStyle";
import { cn } from "@/lib/utils";

// Small pieces shared by the dashboard, My Reports and report detail, so a status or a category
// looks the same on every citizen page (and on the map, which uses the same category spec).

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = REPORT_STATUS_STYLE[status] ?? REPORT_STATUS_FALLBACK;
  return (
    <span
      data-status={status}
      className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}
      style={{ background: style.tint, color: style.ink }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: style.dot }} />
      {status}
    </span>
  );
}

export function CategoryIcon({ category, size = 32, className }: { category: string; size?: number; className?: string }) {
  const { icon: Icon, color } = getCategoryMarkerSpec(category);
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ background: color, width: size, height: size }}
    >
      <Icon color={glyphColor(color)} size={Math.round(size * 0.47)} strokeWidth={2.25} />
    </span>
  );
}

// Active = still being handled (Reported, Under Review, In Progress). Rejected counts only in the total.
export function summarizeCounts(counts: MyReportsPage["counts"]) {
  const n = (status: string) => counts[status] ?? 0;
  const total = Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return { total, active: n("Reported") + n("Under Review") + n("In Progress"), resolved: n("Resolved"), rejected: n("Rejected") };
}

export const reportDateFormat = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
