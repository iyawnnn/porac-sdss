"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminTicketGeoRow } from "@/lib/admin/tickets";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";

function ImagePlaceholderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 15l-5-4-4 3-3-2-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function TicketPopup({ ticket }: { ticket: AdminTicketGeoRow }) {
  const urgency = getUrgencyBandStyle(ticket.urgency_band);
  const [imageFailed, setImageFailed] = useState(false);
  const title = ticket.title ?? ticket.category;
  const showImage = Boolean(ticket.image_url) && !imageFailed;

  return (
    <div className="w-56 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${urgency.className}`}>
          {ticket.priority_index ?? "—"}
        </span>
        <span className="rounded-full bg-line-100 px-2 py-0.5 text-xs text-ink-500">{ticket.status}</span>
      </div>

      {showImage ? (
        <img
          src={ticket.image_url!}
          alt={`Hazard photo for ${title} in ${ticket.barangay_name}`}
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

      <Link
        href={`/admin/tickets/${ticket.id}`}
        className="block w-full rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-900"
      >
        View details
      </Link>
    </div>
  );
}
