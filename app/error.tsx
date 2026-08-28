"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Root boundary — the only one that catches a throw from app/admin/layout.tsx
// or app/(citizen)/layout.tsx. error.js does not wrap the layout.js above it
// in its own segment (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/error.md), so app/admin/error.tsx alone cannot catch a
// throw originating in the admin layout — only this root boundary can, since
// both layouts are nested below it. Copy AND the secondary link stay neutral:
// this can render for either an admin or a citizen request (e.g. AdminLayout's
// own getAdminSessionFromApi() call throwing), so it can't safely assume
// /admin/login or /reports the way the page-level boundaries below it can.
// No session read, no API call — those are exactly what failed to produce
// this boundary in the first place.
//
// error.message is intentionally never shown here. In development Next
// forwards the original Error's message; in production it forwards only
// `digest` — no message field at all (verified against a production build:
// the RSC payload for a Server Component throw serializes as
// `{"digest":"..."}`  with no `message` key). Since api-client.ts's
// distinguishable "network error reaching" text is exactly the kind of
// Server Component error message production strips, a message-derived
// "unreachable vs. errored" distinction would only ever appear in dev and
// silently vanish in prod — worse than not having it, since it would look
// like it works during development and then go generic in production. One
// honest, environment-independent message instead.
export default function RootError({
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
    console.error("[RootError]", error.digest ? `digest=${error.digest}` : "(no digest)", error);
  }, [error]);

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
        {error.digest && <p className="mt-1 text-xs text-ink-400">Reference: {error.digest}</p>}
      </div>
      <div className="mt-1 flex gap-3">
        <Button disabled={isPending} onClick={() => startTransition(() => unstable_retry())}>
          {isPending ? "Retrying…" : "Try Again"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    </main>
  );
}
