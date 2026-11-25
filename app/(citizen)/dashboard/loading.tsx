import { COMMUNITY_SPAN, MapSkeleton, PanelSkeleton } from "@/components/features/citizen/dashboard/DashboardSections";
import { Skeleton } from "@/components/ui/skeleton";

// Same order and section skeletons as page.tsx, so nothing moves when content streams in.
export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Loading dashboard" className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div aria-hidden="true" className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64 max-w-full motion-reduce:animate-none" />
          <Skeleton className="h-5 w-96 max-w-full motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-11 w-40 motion-reduce:animate-none" />
      </div>
      <MapSkeleton />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PanelSkeleton />
        <PanelSkeleton />
        <PanelSkeleton className={COMMUNITY_SPAN} />
      </div>
    </main>
  );
}
