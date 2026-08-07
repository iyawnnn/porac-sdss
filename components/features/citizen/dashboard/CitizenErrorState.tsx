"use client";

import Link from "next/link";

// Shared body for every citizen route's error.tsx (Next.js requires each
// error.tsx to be its own Client Component default export, so this can't be
// the export itself — each route's error.tsx is a thin wrapper passing its
// own title/backHref).
export function CitizenErrorState({
  title,
  reset,
  backHref,
  backLabel,
}: {
  title: string;
  reset: () => void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:px-6">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-[16px] font-semibold leading-[24px] text-ink-900">{title}</p>
        <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
          Something went wrong reaching the server. Please try again in a moment.
        </p>
      </div>
      <div className="mt-1 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600"
        >
          Try Again
        </button>
        <Link
          href={backHref}
          className="inline-flex h-11 items-center rounded-md border border-line-200 px-5 text-sm font-medium text-ink-700 transition-colors duration-[120ms] hover:bg-canvas"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
