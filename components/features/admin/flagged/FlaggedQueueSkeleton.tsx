import { Skeleton } from "@/components/ui/skeleton";
import { gridTemplate, FLAGGED_COLUMNS } from "./queue/columns";

// The loading shape of the real table, laid out from the SAME column model the
// header and rows use — so a column added to queue/columns.ts cannot leave the
// skeleton one track short. (The Ticket Queue's skeleton carried a hand-synced
// COLUMN_COUNT before its rebuild; this one never had the chance to drift.)
const GRID_TEMPLATE = gridTemplate();
const COLUMN_COUNT = FLAGGED_COLUMNS.length;
const SKELETON_ROWS = 10;

export function FlaggedQueueSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-[42ch]" />
      </div>

      <div className="flex gap-6 border-b border-border pb-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton className="h-4 w-24" key={i} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="rounded-xl border border-border bg-card px-4 pt-3.5 pb-4" key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Skeleton className="h-8 w-[300px]" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="ml-auto size-8" />
          <Skeleton className="size-8" />
        </div>

        <div className="h-[34px] border-b border-border bg-[var(--color-surface-subtle)]" />

        {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
          <div
            className="grid items-center gap-2 border-b border-muted px-3 py-[9px]"
            key={rowIndex}
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            {Array.from({ length: COLUMN_COUNT }).map((__, cellIndex) => (
              <Skeleton className="h-4 w-full max-w-24" key={cellIndex} />
            ))}
          </div>
        ))}

        <div className="flex items-center justify-between border-t border-border bg-[var(--color-surface-subtle)] px-3.5 py-2.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-48" />
        </div>
      </div>
    </div>
  );
}
