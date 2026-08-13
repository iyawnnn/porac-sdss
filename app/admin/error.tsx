"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Admin page-level boundary, parity with the six app/(citizen)/**/error.tsx
// files. Deliberately not a wrapper around CitizenErrorState: that component
// hard-codes a `reset` prop (see app/(citizen)/dashboard/CitizenErrorState.tsx),
// which would be misleading to pass unstable_retry into, and it's scoped
// under a citizen feature folder. This only catches page-level throws within
// app/admin/**; a throw from app/admin/layout.tsx itself is caught by the
// root app/error.tsx instead, since error.js doesn't wrap the layout.js above
// it in the same segment.
export default function AdminError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:px-6">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-[16px] font-semibold leading-[24px] text-ink-900">Couldn&apos;t load this page</p>
        <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
          Something went wrong reaching the server. Please try again in a moment.
        </p>
      </div>
      <div className="mt-1 flex gap-3">
        <Button onClick={() => unstable_retry()}>Try Again</Button>
        <Button asChild variant="outline">
          <Link href="/admin">Back to Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
