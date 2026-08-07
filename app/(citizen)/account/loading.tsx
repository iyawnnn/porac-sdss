export default function AccountLoading() {
  return (
    <main aria-busy="true" aria-label="Loading account settings" className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-8 w-56 animate-pulse rounded bg-line-100" />
      <div className="mt-2 h-5 w-80 max-w-full animate-pulse rounded bg-line-100" />
      <div className="mt-6 h-72 animate-pulse rounded-xl border border-line-200 bg-surface" />
    </main>
  );
}
