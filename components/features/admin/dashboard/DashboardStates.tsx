import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { CardBodyPanel } from "@/components/features/admin/shared/CardBodyPanel";
import { CardHeaderRow } from "@/components/features/admin/shared/CardHeaderRow";

// These skeletons deliberately mirror DashboardClient's real geometry —
// same rounded-xl/py-5/bg-muted cards with an inset white CardBodyPanel,
// same gap-3 grid, same dashboard:col-span-7/3 split, same sparkline slot
// on every KPI card. docs/design-system.md §5.5 requires this: when a
// skeleton's grid or card shape drifts from the page it stands in for, the
// layout visibly jumps at hydration. Reusing the real CardBodyPanel/
// CardHeaderRow components (rather than hand-copied classes) means this
// can't drift the way the header-tab styling did across its earlier
// iterations — any future change to those two components' spacing applies
// here automatically. Any other change to the card chrome in
// DashboardClient still needs a matching change here.
// px-4 matches the table's gutters now that its first/last columns are
// pl-4/pr-4 rather than the pl-6/pr-6 they used to carry.
function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-3" key={index}>
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

// All three cards carry a sparkline now (activeTicketTrend,
// pendingWorkOrderTrend, incidentTrend), so all three skeletons reserve the
// h-9 w-24 chart slot — previously only one did.
function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card className="gap-0 rounded-xl bg-muted pt-2 pb-5" key={index}>
          <CardHeader className="px-4 pb-2">
            <CardHeaderRow>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-5 shrink-0 rounded" />
            </CardHeaderRow>
          </CardHeader>
          <CardBodyPanel className="flex items-end justify-between gap-3 px-4 pt-3 pb-4">
            {/* Three lines, matching the real card exactly: the value, the
                delta figure, then the "vs last week" qualifier on its own
                line beneath it (DeltaIndicator's `stacked` variant). The
                cards carry no caption line any more. */}
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0" />
          </CardBodyPanel>
        </Card>
      ))}
    </div>
  );
}

function RailSkeleton() {
  return (
    <Card className="flex flex-col gap-0 overflow-hidden rounded-xl bg-muted pt-2 pb-5 dashboard:col-span-3">
      <CardHeader className="px-4 pb-2">
        <CardHeaderRow>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="size-5 shrink-0 rounded" />
        </CardHeaderRow>
      </CardHeader>
      <CardBodyPanel className="flex flex-1 flex-col divide-y divide-border">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="flex items-center gap-3 px-4 py-3" key={index}>
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-8 shrink-0" />
          </div>
        ))}
      </CardBodyPanel>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading operations dashboard" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        {/* Matches RangeControl's pinned trigger (size="sm" = h-7, w-36),
            not the ~w-56 the segmented toggle it replaced used to occupy. */}
        <Skeleton className="h-7 w-36" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 dashboard:grid-cols-10 dashboard:items-start">
        <div className="flex min-w-0 flex-col gap-3 dashboard:col-span-7">
          <KpiRowSkeleton />
          <Card className="gap-0 rounded-xl bg-muted pt-2 pb-5">
            <CardHeader className="px-4 pb-2">
              <CardHeaderRow>
                <Skeleton className="h-3 w-56" />
                <Skeleton className="size-5 shrink-0 rounded" />
              </CardHeaderRow>
            </CardHeader>
            <CardBodyPanel className="px-4 pt-3 pb-4">
              <Skeleton className="h-8 w-24" />
              {/* Matches the chart's h-60 sm:h-64, so the card doesn't resize
                  when the real BarChart mounts. */}
              <Skeleton className="mt-2 h-60 w-full sm:h-64" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </CardBodyPanel>
          </Card>
        </div>
        <RailSkeleton />
      </div>
      {/* pt-2 pb-5 and a single-line header, matching the real card: it lost
          its CardDescription and its py-5 padding, and "View all" now shares
          the right-hand cluster with the icon. */}
      <Card className="gap-0 overflow-hidden rounded-xl bg-muted pt-2 pb-5">
        <CardHeader className="px-4 pb-2">
          <CardHeaderRow>
            <Skeleton className="h-3 w-48" />
            <div className="flex shrink-0 items-center gap-3">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="size-5 shrink-0 rounded" />
            </div>
          </CardHeaderRow>
        </CardHeader>
        <CardBodyPanel>
          <CardContent className="px-0">
            <TableSkeleton />
          </CardContent>
        </CardBodyPanel>
      </Card>
    </div>
  );
}

export function DashboardError({ detail }: { detail?: string }) {
  return (
    <AdminErrorCard
      detail={detail}
      message={"The operations dashboard couldn't load live data from the API. Ticket Queue and the Interactive Map are unaffected — try reloading this page in a moment."}
      title="Dashboard Data Unavailable"
    />
  );
}
