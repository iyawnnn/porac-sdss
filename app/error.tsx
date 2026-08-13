"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Root boundary — the only one that catches a throw from app/admin/layout.tsx
// or app/(citizen)/layout.tsx. error.js does not wrap the layout.js above it
// in its own segment (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/error.md), so app/admin/error.tsx alone cannot catch a
// throw originating in the admin layout — only this root boundary can, since
// both layouts are nested below it. Copy stays neutral: this can render for
// either an admin or a citizen request. No session read, no API call — those
// are exactly what failed to produce this boundary in the first place.
export default function RootError({
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
        <p className="text-[16px] font-semibold leading-[24px] text-ink-900">Something went wrong</p>
        <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
          Something went wrong reaching the server. Please try again in a moment.
        </p>
      </div>
      <div className="mt-1 flex gap-3">
        <Button onClick={() => unstable_retry()}>Try Again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    </main>
  );
}
