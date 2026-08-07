export default function ReportFormLoading() {
  return (
    <main aria-busy="true" aria-label="Loading report form" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-8 w-64 animate-pulse rounded bg-line-100" />
      <div className="mt-2 h-5 w-96 max-w-full animate-pulse rounded bg-line-100" />
      <div className="mt-6 h-80 animate-pulse rounded-xl border border-line-200 bg-surface" />
      <div className="mt-4 h-48 animate-pulse rounded-xl border border-line-200 bg-surface" />
    </main>
  );
}
