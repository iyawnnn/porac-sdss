import Link from "next/link";

// Shared "please sign in" state for citizen pages that render `null` today
// when getCitizenSessionFromApi() comes back empty — proxy.ts already
// redirects unauthenticated requests before these pages render, so this is
// defense in depth, but a blank page is still the wrong fallback if it's
// ever hit (e.g. a session cookie that expires mid-request).
export function CitizenUnauthorized() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:px-6">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
        <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-[16px] font-semibold leading-[24px] text-ink-900">Sign in to continue</p>
        <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
          You need to be signed in to view your reports.
        </p>
      </div>
      <Link
        href="/login"
        className="mt-1 inline-flex h-11 items-center rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600"
      >
        Sign In
      </Link>
    </main>
  );
}
