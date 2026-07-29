import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTicketDetail,
  getTicketPriorityContext,
  type TicketDetail,
  type TicketReport,
  type TicketPriorityContext,
} from "@/lib/admin/tickets";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";
import { priorityBandClass } from "@/lib/ui/priority";
import { StatusPill } from "@/app/admin/StatusPill";
import { ImageLightbox } from "@/app/admin/flagged/ImageLightbox";
import { TriagePanel } from "./TriagePanel";
import TicketLocationMapLoader from "./TicketLocationMapLoader";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};
const ACTIVE_STATUSES = ["Reported", "Under Review", "In Progress"];

const GLASS_CARD = "rounded-xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-md p-5";

// Decomposition bar segments (DESIGN.md §5.5). Each segment occupies an
// equal third of the track; the fill *within* that third is the factor's
// own 0-1 value, so filled area = (1/3) * factor = the factor's actual
// contribution to urgency_score. Brand ramp, not the urgency ramp — this
// bar answers "where did the score come from", not "how severe is it".
const DECOMPOSITION_SEGMENTS = [
  { key: "E", sub: "elevation", field: "elevation_factor" as const, barClass: "bg-brand-300" },
  { key: "P", sub: "rainfall", field: "precipitation_factor" as const, barClass: "bg-brand-500" },
  { key: "C", sub: "cluster", field: "cluster_factor" as const, barClass: "bg-brand-700" },
];

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const ticketId = Number(id);

  await recomputeActiveTicketUrgency();
  const data = await getTicketDetail(ticketId);
  if (!data) notFound();

  const { ticket, reports, history, reassignments } = data;
  const priorityContext = ACTIVE_STATUSES.includes(ticket.status)
    ? await getTicketPriorityContext(ticketId)
    : null;

  // Only trust a same-origin queue URL forwarded from the ticket list —
  // never redirect off /admin/tickets based on an arbitrary query param.
  const backHref = from && from.startsWith("/admin/tickets") ? from : "/admin/tickets";
  const nextStatus = NEXT_STATUS[ticket.status];
  const bandStyle = getUrgencyBandStyle(ticket.urgency_band);
  const primaryReport = reports[0] as TicketReport | undefined;
  const barangayGeometry = ticket.barangay_geojson ? JSON.parse(ticket.barangay_geojson) : null;

  const timelineEvents = [
    ...history.map((h) => ({ at: h.changed_at, label: h.status, actor: h.admin_name, kind: "status" as const })),
    ...reassignments.map((r) => ({
      at: r.reassigned_at,
      label: `Reassigned ${r.from_office} → ${r.to_office}`,
      actor: r.admin_name,
      kind: "reassign" as const,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-4">
      <div>
        <Link href={backHref} className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← Back to ticket queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink-900">
            #{ticket.id} · {ticket.category}
            {primaryReport ? ` — ${primaryReport.title}` : ""}
          </h1>
          <StatusPill status={ticket.status} size="lg" />
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${priorityBandClass(ticket.priority_index)}`}>
            Priority {ticket.priority_index ?? "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px] lg:items-start">
        <div className="space-y-4">
          <IncidentOverviewCard ticket={ticket} primaryReport={primaryReport} reportCount={reports.length} />
          <EvidenceGalleryCard reports={reports} />
          {ticket.resolution_image_url && primaryReport && (
            <BeforeAfterCard
              beforeUrl={primaryReport.image_url}
              afterUrl={ticket.resolution_image_url}
              notes={ticket.resolution_notes}
              title={primaryReport.title}
            />
          )}
          <TimelineCard events={timelineEvents} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className={GLASS_CARD}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Location</p>
            <div className="overflow-hidden rounded-lg border border-line-100">
              <TicketLocationMapLoader
                lat={ticket.lat}
                lng={ticket.lng}
                urgencyBand={ticket.urgency_band}
                barangayGeoJson={barangayGeometry}
              />
            </div>
            <p className="mt-2 text-xs text-ink-500">
              {ticket.barangay_name} · {ticket.lat.toFixed(5)}, {ticket.lng.toFixed(5)}
            </p>
          </div>

          {priorityContext && (
            <PriorityBreakdownCard priorityIndex={ticket.priority_index} context={priorityContext} />
          )}

          <UrgencyDecompositionCard ticket={ticket} bandStyle={bandStyle} />

          <TriagePanel ticketId={ticket.id} nextStatus={nextStatus} currentOffice={ticket.assigned_office} />
        </div>
      </div>
    </main>
  );
}

function IncidentOverviewCard({
  ticket,
  primaryReport,
  reportCount,
}: {
  ticket: TicketDetail;
  primaryReport: TicketReport | undefined;
  reportCount: number;
}) {
  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Incident overview</p>
      {primaryReport?.description && <p className="mb-3 text-sm text-ink-700">{primaryReport.description}</p>}
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Barangay</p>
          <p className="text-ink-900">{ticket.barangay_name}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Office</p>
          <p className="text-ink-900">{ticket.assigned_office}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Reports merged</p>
          <p className="font-mono tabular-nums text-ink-900">{reportCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">First reported</p>
          <p className="font-mono text-xs text-ink-900">
            {primaryReport ? new Date(primaryReport.created_at).toLocaleString() : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function EvidenceGalleryCard({ reports }: { reports: TicketReport[] }) {
  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
        Evidence photos ({reports.length})
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reports.map((report) => (
          <div key={report.id} className="rounded-lg border border-line-100 p-3">
            <ImageLightbox
              src={report.image_url}
              alt={`Hazard evidence photo submitted for "${report.title}", reported ${new Date(report.created_at).toLocaleDateString()}`}
            />
            <p className="mt-2 text-sm font-medium text-ink-900">{report.title}</p>
            <p className="text-xs uppercase tracking-wide font-medium text-ink-500">
              Reported as · {report.citizen_severity}
            </p>
            <ExifTags report={report} />
          </div>
        ))}
        {reports.length === 0 && <p className="text-sm text-ink-400">No member reports on this ticket.</p>}
      </div>
    </div>
  );
}

function ExifTags({ report }: { report: TicketReport }) {
  const exif = report.exif_data;
  const gpsLat = typeof exif?.GPSLatitude === "number" ? exif.GPSLatitude : null;
  const gpsLng = typeof exif?.GPSLongitude === "number" ? exif.GPSLongitude : null;
  const capturedAt = typeof exif?.DateTimeOriginal === "string" ? exif.DateTimeOriginal : null;
  const make = typeof exif?.Make === "string" ? exif.Make : null;
  const model = typeof exif?.Model === "string" ? exif.Model : null;

  const tags: string[] = [];
  if (gpsLat !== null && gpsLng !== null) tags.push(`GPS ${gpsLat.toFixed(5)}, ${gpsLng.toFixed(5)}`);
  if (capturedAt) tags.push(`Captured ${new Date(capturedAt).toLocaleString()}`);
  if (make || model) tags.push([make, model].filter(Boolean).join(" "));

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.length === 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">No EXIF data</span>
      ) : (
        tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {tag}
          </span>
        ))
      )}
      {report.elevation_m !== null && (
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
          Elevation (server) {report.elevation_m.toFixed(0)}m
        </span>
      )}
      {report.location_mismatch_m !== null && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
          {report.location_mismatch_m.toFixed(0)}m from EXIF GPS
        </span>
      )}
    </div>
  );
}

function BeforeAfterCard({
  beforeUrl,
  afterUrl,
  notes,
  title,
}: {
  beforeUrl: string;
  afterUrl: string;
  notes: string | null;
  title: string;
}) {
  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Resolution — before &amp; after</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-500">Before</p>
          <ImageLightbox src={beforeUrl} alt={`Original hazard report photo for "${title}", before resolution`} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-500">After</p>
          <ImageLightbox src={afterUrl} alt={`Field team resolution proof photo for "${title}", after repair`} />
        </div>
      </div>
      {notes && <p className="mt-3 text-sm text-ink-700">{notes}</p>}
    </div>
  );
}

function TimelineCard({
  events,
}: {
  events: { at: string; label: string; actor: string | null; kind: "status" | "reassign" }[];
}) {
  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Status &amp; audit timeline</p>
      {events.length === 0 ? (
        <p className="text-sm text-ink-400">No lifecycle events yet.</p>
      ) : (
        <ol className="space-y-0">
          {events.map((event, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    event.kind === "status" ? "bg-brand-500" : "bg-slate-400"
                  }`}
                />
                {i < events.length - 1 && <span className="w-px flex-1 bg-line-200" />}
              </div>
              <div className="pb-4">
                <p className="text-sm font-medium text-ink-900">{event.label}</p>
                <p className="text-xs text-ink-500">
                  {new Date(event.at).toLocaleString()}
                  {event.actor ? ` · ${event.actor}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PriorityBreakdownCard({
  priorityIndex,
  context,
}: {
  priorityIndex: number | null;
  context: TicketPriorityContext;
}) {
  const { breakdown, rain1hMm } = context;
  const rows = [
    { label: "Severity weight", factor: breakdown.severityFactor, contribution: breakdown.severityContribution, note: breakdown.severity },
    { label: "Ticket age factor", factor: breakdown.ageFactor, contribution: breakdown.ageContribution, note: null },
    { label: "Barangay active density", factor: breakdown.spatialFactor, contribution: breakdown.spatialContribution, note: null },
  ];

  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Priority breakdown</p>
      <p className="mb-3 font-mono text-2xl font-medium tabular-nums text-ink-900">{priorityIndex ?? "—"}</p>
      <table className="w-full text-xs text-ink-700 border-collapse">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="font-normal pb-1">Factor</th>
            <th className="font-normal pb-1 text-right">Value</th>
            <th className="font-normal pb-1 text-right">Contribution</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="py-0.5 font-sans">
                {row.label}
                {row.note && <span className="ml-1 text-ink-400">({row.note})</span>}
              </td>
              <td className="text-right">{row.factor.toFixed(3)}</td>
              <td className="text-right">{row.contribution.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-500">Local rain rate right now: {rain1hMm}mm/h (context only, not a priority input)</p>
    </div>
  );
}

function UrgencyDecompositionCard({ ticket, bandStyle }: { ticket: TicketDetail; bandStyle: { className: string } }) {
  return (
    <div className={GLASS_CARD}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">System urgency (computed)</p>
      <div className="flex items-baseline gap-3 mb-4">
        <p className="font-mono text-3xl font-medium tabular-nums text-ink-900">
          {ticket.urgency_score?.toFixed(3) ?? "—"}
        </p>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${bandStyle.className}`}>
          {ticket.urgency_band ?? "—"}
        </span>
      </div>

      <div className="flex gap-0.5 h-2 w-full mb-1.5">
        {DECOMPOSITION_SEGMENTS.map((seg) => {
          const value = ticket[seg.field];
          const fillPct = value != null ? clamp01(value) * 100 : 0;
          return (
            <div key={seg.key} className="flex-1 h-full rounded-full bg-line-100 overflow-hidden">
              <div className={`h-full rounded-full ${seg.barClass}`} style={{ width: `${fillPct}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 text-center mb-2">
        {DECOMPOSITION_SEGMENTS.map((seg) => {
          const value = ticket[seg.field];
          return (
            <div key={seg.key} className="flex-1">
              <p className="font-mono text-xs tabular-nums text-ink-700">
                {seg.key} {value?.toFixed(3) ?? "—"}
              </p>
              <p className="text-[11px] text-ink-400">{seg.sub}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-500">Elevation: {ticket.elevation_m ?? "—"} m</p>
    </div>
  );
}
