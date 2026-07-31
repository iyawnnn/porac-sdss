"use client";

import { useEffect, useState } from "react";

export function ImageLightbox({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block h-40 w-full overflow-hidden rounded-lg border border-line-200"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-sm font-medium text-white opacity-0 transition-opacity group-hover:bg-slate-900/30 group-hover:opacity-100">
          Click to zoom
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report photo, enlarged"
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/85 p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close image preview"
            className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-white"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
