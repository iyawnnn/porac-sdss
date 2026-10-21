"use client";

import Link from "next/link";
import type { PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { publicUpdateForStatus } from "@/lib/utils/ui/public-update";

const STATUS_STYLE: Record<string, { tint: string; ink: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741" },
};
const FALLBACK_STATUS_STYLE = { tint: "#F1F3F5", ink: "#434B54" };

// Same long-date format as the citizen report detail page.
const DATE_FMT: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, DATE_FMT);
}

// The manuscript's Appendix L "Selected report" panel (Citizen Web-GIS Map),
// manuscript revision Phase 1, step 6d: a privacy-limited view of someone
// else's report. The heading is the category, never a citizen's title, and
// there is no photo — the API no longer sends either. A citizen's own report
// keeps its full detail behind "View my report".
export function PublicTicketPopup({ ticket }: { ticket: PublicTicketGeoRow }) {
  const pill = STATUS_STYLE[ticket.status] ?? FALLBACK_STATUS_STYLE;

  return (
    <div className="w-56 space-y-2 text-sm">
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: pill.tint, color: pill.ink }}
      >
        {ticket.status}
      </span>

      <p className="font-medium text-ink-900">{ticket.category}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-ink-500">Barangay</dt>
        <dd className="text-ink-900">{ticket.barangay_name}</dd>
        <dt className="text-ink-500">Location</dt>
        <dd className="text-ink-900">Approximate</dd>
        <dt className="text-ink-500">Reported</dt>
        <dd className="text-ink-900">{formatDate(ticket.reported_at)}</dd>
        <dt className="text-ink-500">Last update</dt>
        <dd className="text-ink-900">{formatDate(ticket.last_updated_at)}</dd>
        <dt className="text-ink-500">Handled by</dt>
        <dd className="text-ink-900">{ticket.assigned_office}</dd>
      </dl>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Public update</p>
        <p className="text-xs text-ink-700">{publicUpdateForStatus(ticket.status)}</p>
      </div>

      <p className="text-[11px] leading-4 text-ink-400">
        Public view: reporter identity, photos, exact pins and internal records are not shown.
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
