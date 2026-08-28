"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";

// Shared body for every citizen route's error.tsx (Next.js requires each
// error.tsx to be its own Client Component default export, so this can't be
// the export itself — each route's error.tsx is a thin wrapper passing its
// own title).
export function CitizenErrorState({
  title,
  error,
  unstable_retry,
}: {
  title: string;
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  // error.digest is the one thing production still hands us reliably (see
  // the comment in app/error.tsx) — logged here so a citizen-reported "it
  // broke" can be matched to the corresponding server-side stack trace.
  useEffect(() => {
    console.error("[CitizenErrorState]", error.digest ? `digest=${error.digest}` : "(no digest)", error);
  }, [error]);

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
        {error.digest && <p className="mt-1 text-xs text-ink-400">Reference: {error.digest}</p>}
      </div>
      <div className="mt-1 flex gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => unstable_retry())}
          className="inline-flex h-11 items-center rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Retrying…" : "Try Again"}
        </button>
        <Link
          href="/reports"
          className="inline-flex h-11 items-center rounded-md border border-line-200 px-5 text-sm font-medium text-ink-700 transition-colors duration-[120ms] hover:bg-canvas"
        >
          My Reports
        </Link>
      </div>
    </main>
  );
}
