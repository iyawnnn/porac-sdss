"use client";

import { useState } from "react";
import { ImageOffIcon } from "lucide-react";

// Same fallback pattern as the admin flagged-queue's RowThumbnail
// (components/features/admin/flagged/FlaggedWorkspace.tsx) — a hero-sized
// slot with no onError fallback shows a browser broken-image icon if
// Cloudinary is slow/unreachable, which is visible and embarrassing during
// a live demo. This is a Client Component (needs onError state) so the
// server-rendered pages that use it stay server components otherwise.
export function ReportImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-label={`${alt} — image unavailable`}
        className={`flex items-center justify-center bg-line-100 text-ink-400 ${className}`}
        role="img"
      >
        <ImageOffIcon aria-hidden="true" className="size-8" />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={className} onError={() => setFailed(true)} src={src} />;
}
