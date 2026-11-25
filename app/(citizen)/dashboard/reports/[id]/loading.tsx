import { Skeleton } from "@/components/ui/skeleton";

// Mirrors page.tsx: back link, the summary card with its tracker, then the report panels beside location.
export default function ReportDetailLoading() {
  return (
    <main aria-busy="true" aria-label="Loading report" className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div aria-hidden="true" className="contents">
        <Skeleton className="h-5 w-28 motion-reduce:animate-none" />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex gap-3.5 p-5">
            <Skeleton className="size-12 shrink-0 rounded-full motion-reduce:animate-none" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-8 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
            </div>
          </div>
          <div className="flex justify-between border-t border-border px-10 pt-5 pb-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="size-7 rounded-full motion-reduce:animate-none" />)}
          </div>
          <Skeleton className="h-12 rounded-none motion-reduce:animate-none" />
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-[13rem_1fr]">
              <Skeleton className="aspect-[4/3] rounded-lg motion-reduce:animate-none" />
              <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 motion-reduce:animate-none" />)}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="mt-3 h-10 first:mt-0 motion-reduce:animate-none" />)}</div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Skeleton className="h-56 rounded-none motion-reduce:animate-none" />
            <div className="grid grid-cols-2 gap-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-9 motion-reduce:animate-none" />)}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
