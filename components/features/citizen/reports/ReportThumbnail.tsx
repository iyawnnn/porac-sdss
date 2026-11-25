"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/features/citizen/reports/report-ui";
import { cn } from "@/lib/utils";

// Cloudinary serves a cropped, sized, auto-format copy when the transform sits after /upload/, so a
// card never downloads the full photo. Seeded local files (/uploads/...) are already small and pass through.
function thumbnailUrl(src: string, size: number) {
  return src.includes("res.cloudinary.com") && src.includes("/upload/")
    ? src.replace("/upload/", `/upload/c_fill,w_${size * 2},h_${size * 2},f_auto,q_auto/`)
    : src;
}

// The report's own photo, or its category icon when there is none or it fails to load.
export function ReportThumbnail({ src, category, size = 72, className }: { src: string | null; category: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted", className)}
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary does the resizing (see thumbnailUrl)
        <img
          src={thumbnailUrl(src, size)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <CategoryIcon category={category} size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}
