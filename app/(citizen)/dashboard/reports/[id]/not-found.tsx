import Link from "next/link";

// Renders for both "no such report" and "not your report" — the API
// collapses both into a 401/404 → notFound() (see the page component's
// comment) specifically so this page can never reveal which case it is.
// Don't split this into a separate "unauthorized" message; that would leak
// ownership information the API deliberately hides.
export default function ReportNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:px-6">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
        <path
          d="M3 7.5 5.25 4h13.5L21 7.5M3 7.5v9A1.5 1.5 0 0 0 4.5 18h15a1.5 1.5 0 0 0 1.5-1.5v-9M3 7.5h5.25l1 2h5.5l1-2H21"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <p className="text-[16px] font-semibold leading-[24px] text-ink-900">Report not found</p>
        <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
          This report doesn&apos;t exist, or isn&apos;t associated with your account.
        </p>
      </div>
      <Link
        href="/reports"
        className="mt-1 inline-flex h-11 items-center rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600"
      >
        Back to My Reports
      </Link>
    </main>
  );
}
