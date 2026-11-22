import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Loading dashboard" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-64 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-72 max-w-full motion-reduce:animate-none" />
        </div>
        <Skeleton className="h-11 w-40 motion-reduce:animate-none" />
      </div>
      <Skeleton className="h-18 motion-reduce:animate-none" />
      <Skeleton className="h-32 sm:h-24 motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
        <Skeleton className="h-80 motion-reduce:animate-none" />
        <Skeleton className="h-87 sm:h-99 motion-reduce:animate-none" />
      </div>
    </main>
  );
}
