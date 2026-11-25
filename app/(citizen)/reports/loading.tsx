import { ReportCardSkeleton } from "@/components/features/citizen/reports/ReportCard";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors page.tsx: heading and summary line, then report cards in the same two-column grid.
export default function MyReportsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading your reports" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-64 max-w-full motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-11 w-40 motion-reduce:animate-none" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <ReportCardSkeleton key={i} />)}
      </div>
    </main>
  );
}
