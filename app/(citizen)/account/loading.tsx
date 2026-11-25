import { Skeleton } from "@/components/ui/skeleton";

// Mirrors page.tsx: heading, then three settings sections (label left, controls right).
export default function AccountLoading() {
  return (
    <main aria-busy="true" aria-label="Loading account settings" className="mx-auto flex max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div aria-hidden="true" className="contents">
        <Skeleton className="h-8 w-56 motion-reduce:animate-none" />
        <Skeleton className="mt-2 h-5 w-72 max-w-full motion-reduce:animate-none" />
        <div className="mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-4 border-b border-border py-6 last:border-b-0 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-28 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-48 motion-reduce:animate-none" />
              </div>
              <Skeleton className="h-28 max-w-md motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
