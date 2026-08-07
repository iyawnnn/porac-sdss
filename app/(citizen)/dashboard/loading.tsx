export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="Loading dashboard" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 h-40 animate-pulse rounded-xl border border-line-200 bg-surface" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-line-200 bg-surface" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="h-96 animate-pulse rounded-xl border border-line-200 bg-surface lg:col-span-2" />
        <div className="h-96 animate-pulse rounded-xl border border-line-200 bg-surface lg:col-span-3" />
      </div>
    </main>
  );
}
