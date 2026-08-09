import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { apiGetOptional } from "@/lib/api-client";
import type {
  TicketDetail,
  TicketReport,
  TicketStatusHistoryRow,
  TicketReassignmentRow,
  TicketPriorityContext,
} from "@/lib/types/admin-tickets";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { priorityBandClass, priorityBandLabel } from "@/lib/utils/ui/priority";
import { StatusPill } from "@/components/features/admin/shared/StatusPill";
import { AdminErrorCard } from "@/components/features/admin/shared/AdminErrorCard";
import { FlagBadge } from "@/components/features/admin/flagged/FlagBadge";
import { moderationStatusLabel } from "@/components/features/admin/flagged/flagText";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentPanel } from "@/components/features/admin/tickets/AssignmentPanel";
import { WorkOrdersPanel } from "@/components/features/admin/tickets/WorkOrdersPanel";
import TicketLocationMapLoader from "@/components/features/admin/tickets/TicketLocationMapLoader";
import { HorizontalStatusTracker } from "@/components/features/admin/tickets/HorizontalStatusTracker";
import { TicketDetailSkeleton } from "@/components/features/admin/tickets/TicketDetailSkeleton";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};
const ACTIVE_STATUSES = ["Reported", "Under Review", "In Progress"];

// Decomposition bar segments (DESIGN.md §5.5). Each segment occupies an
// equal third of the track; the fill *within* that third is the factor's
// own 0-1 value, so filled area = (1/3) * factor = the factor's actual
// contribution to urgency_score.
const DECOMPOSITION_SEGMENTS = [
  { key: "E", sub: "elevation", field: "elevation_factor" as const, barClass: "bg-brand-300" },
  { key: "P", sub: "rainfall", field: "precipitation_factor" as const, barClass: "bg-brand-500" },
  { key: "C", sub: "cluster", field: "cluster_factor" as const, barClass: "bg-brand-700" },
];

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

interface TicketDetailResponse {
  ticket: TicketDetail;
  reports: TicketReport[];
  history: TicketStatusHistoryRow[];
  reassignments: TicketReassignmentRow[];
}

async function TicketDetailData({ ticketId, from }: { ticketId: number; from: string | undefined }) {
  let data: TicketDetailResponse | null;
  let priorityContext: TicketPriorityContext | null = null;
  let workOrders: WorkOrderRow[] = [];
  try {
    // NestJS's GET /admin/tickets/:id recomputes before reading, matching
    // this page's original SSR behavior.
    data = await apiGetOptional<TicketDetailResponse>(`/admin/tickets/${ticketId}`, [401, 404]);
    if (data && ACTIVE_STATUSES.includes(data.ticket.status)) {
      priorityContext = await apiGetOptional<TicketPriorityContext>(`/admin/tickets/${ticketId}/priority-context`, [401, 404]);
    }
    if (data) {
      const workOrdersResponse = await apiGetOptional<{ workOrders: WorkOrderRow[] }>(
        `/admin/work-orders?ticketId=${ticketId}`,
        [401, 404],
      );
      workOrders = workOrdersResponse?.workOrders ?? [];
    }
  } catch (err) {
    return (
      <AdminErrorCard
        detail={err instanceof Error ? err.message : undefined}
        message="This ticket couldn't load live data from the API. The Dashboard and Ticket Queue are unaffected — try reloading this page in a moment."
        title="Ticket Detail Unavailable"
      />
    );
  }
  if (!data) notFound();

  const { ticket, reports, history, reassignments } = data;

  // Only trust a same-origin queue URL forwarded from the ticket list —
  // never redirect off /admin/tickets based on an arbitrary query param.
  const backHref = from && from.startsWith("/admin/tickets") ? from : "/admin/tickets";
  const nextStatus = NEXT_STATUS[ticket.status];
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
  const primaryReport = reports[0] as TicketReport | undefined;
  let barangayGeometry = null;
  try {
    barangayGeometry = ticket.barangay_geojson ? JSON.parse(ticket.barangay_geojson) : null;
  } catch {
    barangayGeometry = null;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 hover:underline" href={backHref}>
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          Back to ticket queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink-900">
            #{ticket.id} · {ticket.category}
            {primaryReport ? ` — ${primaryReport.title}` : ""}
          </h1>
          <StatusPill size="lg" status={ticket.status} />
          <Badge className={urgencyBadge.className} variant="outline">
            Urgency {ticket.priority_score ?? "—"} · {urgencyBadge.label}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-ink-500">
          {ticket.barangay_name} · {ticket.assigned_office} · {ticket.member_count} report{ticket.member_count === 1 ? "" : "s"} merged
          {primaryReport && <> · First reported {new Date(primaryReport.created_at).toLocaleString()}</>}
        </p>
      </div>

      <HorizontalStatusTracker createdAt={ticket.created_at} currentStatus={ticket.status} history={history} nextStatus={nextStatus} ticketId={ticket.id} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Location</p>
              <div className="h-72 overflow-hidden rounded-lg border border-line-100">
                <TicketLocationMapLoader barangayGeoJson={barangayGeometry} lat={ticket.lat} lng={ticket.lng} urgencyBand={ticket.urgency_band} />
              </div>
              <p className="mt-2 text-xs text-ink-500">
                {ticket.barangay_name} · {ticket.lat.toFixed(5)}, {ticket.lng.toFixed(5)}
                {ticket.elevation_m !== null && <> · Elevation {ticket.elevation_m.toFixed(0)}m</>}
              </p>
            </CardContent>
          </Card>

          <EvidenceCard primaryReport={primaryReport} reportCount={reports.length} reports={reports} />

          {ticket.resolution_image_url && primaryReport && (
            <BeforeAfterCard afterUrl={ticket.resolution_image_url} beforeUrl={primaryReport.image_url} notes={ticket.resolution_notes} title={primaryReport.title} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Assignment</p>
              <AssignmentPanel currentOffice={ticket.assigned_office} ticketId={ticket.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <WorkOrdersPanel initialWorkOrders={workOrders} office={ticket.assigned_office as "MEO" | "MDRRMO"} ticketId={ticket.id} />
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <Tabs defaultValue="scoring">
                <TabsList className="w-full">
                  <TabsTrigger value="scoring">Scoring</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>
                <TabsContent className="pt-4" value="scoring">
                  <ScoringTab priorityContext={priorityContext} ticket={ticket} urgencyBadge={urgencyBadge} />
                </TabsContent>
                <TabsContent className="pt-4" value="timeline">
                  <TimelineTab createdAt={ticket.created_at} history={history} reassignments={reassignments} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
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

  return (
    <Suspense fallback={<TicketDetailSkeleton />}>
      <TicketDetailData from={from} ticketId={ticketId} />
    </Suspense>
  );
}

function EvidenceCard({
  primaryReport,
  reportCount,
  reports,
}: {
  primaryReport: TicketReport | undefined;
  reportCount: number;
  reports: TicketReport[];
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Evidence &amp; reports ({reportCount})</p>
        {primaryReport?.description && <p className="mt-2 text-sm text-ink-700">{primaryReport.description}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
          {reports.length === 0 && <p className="text-sm text-ink-400">No member reports on this ticket.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard({ report }: { report: TicketReport }) {
  const exif = report.exif_data;
  const gpsLat = typeof exif?.GPSLatitude === "number" ? exif.GPSLatitude : null;
  const gpsLng = typeof exif?.GPSLongitude === "number" ? exif.GPSLongitude : null;
  const capturedAt = typeof exif?.DateTimeOriginal === "string" ? exif.DateTimeOriginal : null;
  const make = typeof exif?.Make === "string" ? exif.Make : null;
  const model = typeof exif?.Model === "string" ? exif.Model : null;

  const metaParts: string[] = [];
  if (gpsLat !== null && gpsLng !== null) metaParts.push(`GPS ${gpsLat.toFixed(5)}, ${gpsLng.toFixed(5)}`);
  if (capturedAt) metaParts.push(`Captured ${new Date(capturedAt).toLocaleString()}`);
  if (make || model) metaParts.push([make, model].filter(Boolean).join(" "));
  if (report.elevation_m !== null) metaParts.push(`Elevation ${report.elevation_m.toFixed(0)}m`);
  if (report.location_mismatch_m !== null) metaParts.push(`${report.location_mismatch_m.toFixed(0)}m from EXIF GPS`);

  const flags = report.flags ?? [];

  return (
    <div className="rounded-lg border border-line-100 p-3">
      <ImageLightbox
        alt={`Hazard evidence photo submitted for "${report.title}", reported ${new Date(report.created_at).toLocaleDateString()}`}
        src={report.image_url}
      />
      <p className="mt-2 text-sm font-medium text-ink-900">{report.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{report.citizen_severity}</Badge>
        {report.moderation_status && <Badge variant="outline">{moderationStatusLabel(report.moderation_status)}</Badge>}
        {flags.map((flag) => (
          <FlagBadge flag={flag} key={flag} />
        ))}
      </div>
      {metaParts.length > 0 && <p className="mt-1.5 text-xs text-ink-400">{metaParts.join(" · ")}</p>}
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
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink-500 uppercase">Before &amp; after resolution</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-500">Before</p>
            <ImageLightbox alt={`Original hazard report photo for "${title}", before resolution`} src={beforeUrl} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-500">After</p>
            <ImageLightbox alt={`Field team resolution proof photo for "${title}", after repair`} src={afterUrl} />
          </div>
        </div>
        {notes && <p className="mt-3 text-sm text-ink-700">{notes}</p>}
      </CardContent>
    </Card>
  );
}

function ScoringTab({
  ticket,
  urgencyBadge,
  priorityContext,
}: {
  ticket: TicketDetail;
  urgencyBadge: ReturnType<typeof getUrgencyBadgeConfig>;
  priorityContext: TicketPriorityContext | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Urgency (environmental hazard)</p>
        <p className="mt-0.5 text-xs text-ink-400">Elevation + live rainfall + report-cluster density — computed, not citizen-reported.</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink-900">{ticket.priority_score ?? "—"}</span>
          <Badge className={urgencyBadge.className} variant="outline">{urgencyBadge.label}</Badge>
        </div>
        <div className="mt-3 flex h-2 w-full gap-0.5">
          {DECOMPOSITION_SEGMENTS.map((seg) => {
            const value = ticket[seg.field];
            const fillPct = value != null ? clamp01(value) * 100 : 0;
            return (
              <div className="h-full flex-1 overflow-hidden rounded-full bg-line-100" key={seg.key}>
                <div className={`h-full rounded-full ${seg.barClass}`} style={{ width: `${fillPct}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-0.5 text-center">
          {DECOMPOSITION_SEGMENTS.map((seg) => {
            const value = ticket[seg.field];
            return (
              <div className="flex-1" key={seg.key}>
                <p className="font-mono text-xs tabular-nums text-ink-700">{seg.key} {value?.toFixed(3) ?? "—"}</p>
                <p className="text-[11px] text-ink-400">{seg.sub}</p>
              </div>
            );
          })}
        </div>
        {priorityContext && <p className="mt-2 text-xs text-ink-500">Local rain rate right now: {priorityContext.rain1hMm}mm/h</p>}
      </div>

      {priorityContext && (
        <div className="border-t border-line-100 pt-4">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Priority (workflow — how soon to act)</p>
          <p className="mt-0.5 text-xs text-ink-400">Citizen severity + ticket age + barangay density — a separate signal from urgency above.</p>
          <div className="mt-3 flex items-baseline gap-2">
            <Badge className={priorityBandClass(ticket.priority_index)} variant="outline">
              <span className="font-mono tabular-nums">{ticket.priority_index ?? "—"}</span> · {priorityBandLabel(ticket.priority_index)}
            </Badge>
          </div>
          <table className="mt-3 w-full border-collapse text-xs text-ink-700">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="pb-1 font-normal">Factor</th>
                <th className="pb-1 text-right font-normal">Value</th>
                <th className="pb-1 text-right font-normal">Contribution</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {[
                { label: "Severity weight", factor: priorityContext.breakdown.severityFactor, contribution: priorityContext.breakdown.severityContribution, note: priorityContext.breakdown.severity },
                { label: "Ticket age factor", factor: priorityContext.breakdown.ageFactor, contribution: priorityContext.breakdown.ageContribution, note: null },
                { label: "Barangay active density", factor: priorityContext.breakdown.spatialFactor, contribution: priorityContext.breakdown.spatialContribution, note: null },
              ].map((row) => (
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
        </div>
      )}
    </div>
  );
}

interface TimelineEntry {
  key: string;
  timestamp: string;
  description: string;
  actor: string | null;
}

function TimelineTab({
  createdAt,
  history,
  reassignments,
}: {
  createdAt: string;
  history: TicketStatusHistoryRow[];
  reassignments: TicketReassignmentRow[];
}) {
  const entries: TimelineEntry[] = [
    { key: "created", timestamp: createdAt, description: "Ticket created (Reported)", actor: null },
    ...history.map((h, i) => ({ key: `status-${i}`, timestamp: h.changed_at, description: `Status changed to ${h.status}`, actor: h.admin_name })),
    ...reassignments.map((r, i) => ({ key: `reassign-${i}`, timestamp: r.reassigned_at, description: `Reassigned from ${r.from_office} to ${r.to_office}`, actor: r.admin_name })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <ol className="space-y-3">
      {entries.map((entry, i) => (
        <li className="flex gap-3" key={entry.key}>
          <div className="flex flex-col items-center">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-500" />
            {i < entries.length - 1 && <span className="mt-1 w-px flex-1 bg-line-200" />}
          </div>
          <div className="min-w-0 pb-3">
            <p className="text-sm text-ink-900">{entry.description}</p>
            <p className="text-xs text-ink-400">
              {new Date(entry.timestamp).toLocaleString()}
              {entry.actor && <> · {entry.actor}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
