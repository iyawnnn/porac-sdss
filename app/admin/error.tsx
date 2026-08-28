"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Admin page-level boundary, parity with the six app/(citizen)/**/error.tsx
// files. Deliberately not a wrapper around CitizenErrorState: that component
// hard-codes a citizen-facing secondary link, is scoped under a citizen
// feature folder. This only catches page-level throws within app/admin/**; a
// throw from app/admin/layout.tsx itself is caught by the root app/error.tsx
// instead, since error.js doesn't wrap the layout.js above it in the same
// segment.
//
// Secondary action is /admin/login rather than the previous /admin
// (dashboard): if the API is genuinely unreachable, /admin would just call
// getAdminSessionFromApi() again in the admin layout and throw right back
// into this same boundary — /admin/login is a different destination, and
// gives an admin whose session got into a bad state a clean way to
// re-authenticate.
//
// error.message is intentionally never shown here. In development Next
// forwards the original Error's message; in production it forwards only
// `digest` — no message field at all (verified against a production build:
// the RSC payload for a Server Component throw serializes as
// `{"digest":"..."}` with no `message` key). Since api-client.ts's
// distinguishable "network error reaching" text is exactly the kind of
// Server Component error message production strips, a message-derived
// "unreachable vs. errored" distinction would only ever appear in dev and
// silently vanish in prod — worse than not having it. One honest,
// environment-independent message instead.
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  // error.digest is the one thing production still hands us reliably — log
  // it so a report of "the page broke" can be matched to the corresponding
  // server-side stack trace (search server logs for this digest).
  useEffect(() => {
    console.error("[AdminError]", error.digest ? `digest=${error.digest}` : "(no digest)", error);
  }, [error]);

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
        {error.digest && <p className="mt-1 text-xs text-ink-400">Reference: {error.digest}</p>}
      </div>
      <div className="mt-1 flex gap-3">
        <Button disabled={isPending} onClick={() => startTransition(() => unstable_retry())}>
          {isPending ? "Retrying…" : "Try Again"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/login">Admin Login</Link>
        </Button>
      </div>
    </main>
  );
}
