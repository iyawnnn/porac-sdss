import type { BarangayCategoryRow } from "@/lib/types/admin-barangay-insights";
import { formatDistributionPercent } from "../dashboard/DistributionChartUtils";
import { EmptyState } from "../shared/EmptyState";

// A plain ranked list rather than a donut chart — categories are a dynamic,
// open-ended set (TICKET_CATEGORIES has 11 values) with no existing
// per-category color palette anywhere in the app, so inventing one just for
// this one list isn't worth it. formatDistributionPercent is the same pure
// percent formatter the dashboard's donut/legend components already use.
export function CategoryBreakdownList({ categories }: { categories: BarangayCategoryRow[] }) {
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  if (categories.length === 0) {
    return <EmptyState className="items-start p-4 text-left" title="No tickets recorded for this barangay yet." />;
  }

  return (
    <ul className="flex flex-col gap-2 p-4" aria-label="Category breakdown">
      {categories.map((c) => (
        <li className="flex items-center gap-3 text-sm" key={c.category}>
          <span className="w-36 shrink-0 truncate" title={c.category}>{c.category}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: total > 0 ? `${(c.count / total) * 100}%` : "0%" }}
            />
          </span>
          <span className="w-10 shrink-0 text-end font-mono tabular-nums text-muted-foreground">{c.count}</span>
          <span className="w-12 shrink-0 text-end tabular-nums text-muted-foreground">{formatDistributionPercent(c.count, total)}</span>
        </li>
      ))}
    </ul>
  );
}
