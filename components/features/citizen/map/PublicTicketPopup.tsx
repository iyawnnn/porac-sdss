"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { publicUpdateForStatus } from "@/lib/utils/ui/public-update";
import { getCategoryMarkerSpec, glyphColor } from "@/lib/gis/categoryMarker";
import { REPORT_STATUS_FALLBACK, REPORT_STATUS_STYLE } from "@/components/features/citizen/dashboard/reportStatusStyle";
import { Button } from "@/components/ui/button";

// Same long-date format as the citizen report detail page.
const DATE_FMT: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, DATE_FMT);
}

// The manuscript's Appendix L "Selected report" panel (Citizen Web-GIS Map):
// a privacy-limited view of someone else's report. Since manuscript revision
// Phase 6, step 6a (handoff Decision 8) it shows only the status, the
// category as the heading, the barangay, an approximate location and the
// reported date — no title, photo, ticket number, last update or handling
// office; the API sends none of them. A citizen's own report keeps its full
// detail behind "View my report".
export function PublicTicketPopup({ ticket }: { ticket: PublicTicketGeoRow }) {
  const status = REPORT_STATUS_STYLE[ticket.status] ?? REPORT_STATUS_FALLBACK;
  const { icon: Icon, color } = getCategoryMarkerSpec(ticket.category);
  const details = [
    ["Barangay", ticket.barangay_name],
    ["Reported", formatDate(ticket.reported_at)],
  ];

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-popover-foreground">
      {/* pe-6 keeps the heading clear of Leaflet's close button. */}
      <div className="flex gap-2.5 pe-6">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: color }}>
          <Icon color={glyphColor(color)} size={16} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="leading-5 font-semibold">{ticket.category}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: status.tint, color: status.ink }}>
            <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: status.dot }} />
            {ticket.status}
          </span>
        </div>
      </div>

      <dl className="divide-y divide-border rounded-lg border border-border text-xs">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 px-2.5 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg bg-muted px-2.5 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">Public update</p>
        <p className="mt-0.5 text-xs leading-4">{publicUpdateForStatus(ticket.status)}</p>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Approximate location: exact pins, reporter identity, photos and internal records are not shown.
      </p>

      {ticket.own_report_id != null && (
        <Button asChild className="h-9 w-full gap-1.5 hover:bg-primary-hover active:bg-primary-pressed active:not-aria-[haspopup]:translate-y-0">
          <Link href={`/dashboard/reports/${ticket.own_report_id}`}>View my report<ArrowRight aria-hidden="true" /></Link>
        </Button>
      )}
    </div>
  );
}
