import { Skeleton } from "@/components/ui/skeleton";
import { gridTemplate, queueMinWidth, QUEUE_COLUMNS } from "./queue/columns";

// Mirrors TicketsWorkspace's real geometry — same gap-5 root, the same view-tab
// strip, the same 5-up KPI row of white bordered cards, and a table laid out on
// the SAME grid tracks. docs/design-system.md §5.5 requires that: when a
// skeleton's grid drifts from the page it stands in for, the layout visibly
// jumps at hydration, which is exactly what this file used to do.
//
// The column count is no longer a hand-synced constant. It imports QUEUE_COLUMNS
// and gridTemplate() from the same module the real table lays out from, so
// adding or removing a column updates the header strip, the rows and this
// skeleton together and the invariant cannot rot.
const KPI_TILE_COUNT = 5;
const VIEW_TAB_COUNT = 5;
const BODY_ROW_COUNT = 8;

// The queue's cards are white, so a default Skeleton (bg-muted, #f3f4f6) reads
// correctly on them with no override — unlike the dashboard's gray-band cards,
// where the fill had to be forced. Only the two bands that are not white need
// one: the toolbar sits on --card and the header/footer strips on
// --color-surface-subtle, both light enough that bg-border is the readable fill.
const ON_BAND = "bg-border";

export function TicketQueueSkeleton() {
  const gridTemplateColumns = gridTemplate();
  const minWidth = queueMinWidth();

  return (
    <div aria-busy="true" aria-label="Loading ticket queue" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          {/* The recompute pill and the Export CSV button. */}
          <Skeleton className="h-[26px] w-56 rounded-full" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-border pb-2.5">
        {Array.from({ length: VIEW_TAB_COUNT }).map((_, index) => (
          <Skeleton className="h-4 w-24" key={index} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: KPI_TILE_COUNT }).map((_, index) => (
          <div
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4"
            key={index}
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-[15px] shrink-0 rounded" />
            </div>
            {/* One line only — the real tile has no delta or sparkline slot. */}
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Toolbar: search, the single Filters button, and the three-control
            right cluster (sort, columns, density) — not the six standalone
            selects this stood in for before the filters moved into a popover. */}
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Skeleton className="h-8 w-full max-w-[340px]" />
          <Skeleton className="h-8 w-24" />
          <div className="ml-auto flex items-center gap-1.5">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </div>

        {/* Same in-card horizontal scroller and minWidth floor as the real
            table, so the skeleton cannot show a layout the page then abandons. */}
        <div className="overflow-x-auto">
          <div style={{ minWidth }}>
            <div
              className="grid h-[34px] items-center gap-2 border-b border-border bg-[var(--color-surface-subtle)] px-3"
              style={{ gridTemplateColumns }}
            >
              {QUEUE_COLUMNS.map((column) => (
                <Skeleton className={`h-2.5 w-full ${ON_BAND}`} key={column.key} />
              ))}
            </div>

            {Array.from({ length: BODY_ROW_COUNT }).map((_, row) => (
              <div
                className="grid items-center gap-2 border-b border-muted px-3 py-[9px]"
                key={row}
                style={{ gridTemplateColumns }}
              >
                {QUEUE_COLUMNS.map((column) => (
                  <Skeleton className="h-4 w-full max-w-24" key={column.key} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border bg-[var(--color-surface-subtle)] px-3.5 py-2.5">
          <Skeleton className={`h-3 w-40 ${ON_BAND}`} />
          <div className="flex items-center gap-2">
            <Skeleton className={`h-7 w-20 ${ON_BAND}`} />
            <Skeleton className={`h-7 w-32 ${ON_BAND}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
