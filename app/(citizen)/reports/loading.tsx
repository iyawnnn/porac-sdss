function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line-200 bg-surface">
      <div className="h-48 w-full animate-pulse bg-line-100" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-line-100" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-line-100" />
        <div className="h-16 w-full animate-pulse rounded bg-line-100" />
        <div className="h-11 w-full animate-pulse rounded-md bg-line-100" />
      </div>
    </div>
  );
}

export default function MyReportsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading your reports" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 h-40 animate-pulse rounded-xl border border-line-200 bg-surface" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-line-200 bg-surface" />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
