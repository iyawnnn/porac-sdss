"use client";

import { useState } from "react";
import Link from "next/link";
import type { PublicTicketGeoRow } from "@/lib/citizens/publicMap";

const STATUS_STYLE: Record<string, { tint: string; ink: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741" },
};
const FALLBACK_STATUS_STYLE = { tint: "#F1F3F5", ink: "#434B54" };

function ImagePlaceholderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 15l-5-4-4 3-3-2-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PublicTicketPopup({ ticket }: { ticket: PublicTicketGeoRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const pill = STATUS_STYLE[ticket.status] ?? FALLBACK_STATUS_STYLE;
  const title = ticket.title ?? ticket.category;
  const showImage = Boolean(ticket.image_url) && !imageFailed;

  return (
    <div className="w-56 space-y-2 text-sm">
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: pill.tint, color: pill.ink }}
      >
        {ticket.status}
      </span>

      {showImage ? (
        <img
          src={ticket.image_url!}
          alt={`Community-submitted photo for ${title} in ${ticket.barangay_name}`}
          className="mb-2 h-32 w-full rounded-md object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className="mb-2 flex h-32 w-full items-center justify-center rounded-md bg-slate-100 text-slate-400"
          role="img"
          aria-label="No photo submitted for this report"
        >
          <ImagePlaceholderIcon />
        </div>
      )}

      <p className="font-medium text-ink-900">{title}</p>
      <p className="text-ink-500">
        {ticket.category} · {ticket.barangay_name}
      </p>

      {ticket.own_report_id != null && (
        <Link
          href={`/dashboard/reports/${ticket.own_report_id}`}
          className="block w-full rounded-md bg-brand-500 px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-600"
        >
          View my report
        </Link>
      )}
    </div>
  );
}
