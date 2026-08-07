export default function ReportDetailLoading() {
  return (
    <main aria-busy="true" aria-label="Loading report" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-5 w-40 animate-pulse rounded bg-line-100" />
      <div className="mt-4 h-64 animate-pulse rounded-xl border border-line-200 bg-surface" />
      <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="h-72 animate-pulse rounded-xl border border-line-200 bg-surface" />
          <div className="h-48 animate-pulse rounded-xl border border-line-200 bg-surface" />
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-line-200 bg-surface" />
      </div>
    </main>
  );
}
