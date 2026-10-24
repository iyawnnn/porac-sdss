import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { apiGetOptional } from "@/lib/api-client";
import type {
  TicketDetail,
  TicketReport,
  TicketStatusHistoryRow,
  TicketReassignmentRow,
  TicketReferralRow,
  TicketPriorityContext,
  OperationalAssessment,
  TicketMergedInto,
} from "@/lib/types/admin-tickets";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import type { RelatedTicketCandidate, RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";
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
import { ReferralPanel } from "@/components/features/admin/tickets/ReferralPanel";
import { RejectTicketPanel } from "@/components/features/admin/tickets/RejectTicketPanel";
import { WorkOrdersPanel } from "@/components/features/admin/tickets/WorkOrdersPanel";
import { OperationalAssessmentPanel } from "@/components/features/admin/tickets/OperationalAssessmentPanel";
import { RelatedTicketsPanel } from "@/components/features/admin/tickets/RelatedTicketsPanel";
import { ReportGroupingActions } from "@/components/features/admin/tickets/grouping/ReportGroupingActions";
import TicketLocationMapLoader from "@/components/features/admin/tickets/TicketLocationMapLoader";
import { HorizontalStatusTracker } from "@/components/features/admin/tickets/HorizontalStatusTracker";
import { TicketDetailSkeleton } from "@/components/features/admin/tickets/TicketDetailSkeleton";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};
const ACTIVE_STATUSES = ["Reported", "Under Review", "In Progress"];
// Appendix H resolution outcome (manuscript revision Phase 2, step 2b).
const RESOLUTION_OUTCOME_LABEL: Record<NonNullable<TicketDetail["resolution_outcome"]>, string> = {
  MUNICIPAL_ACTION_COMPLETED: "Municipal action completed",
  EXTERNAL_REFERRAL: "External referral",
};

interface TicketDetailResponse {
  ticket: TicketDetail;
  reports: TicketReport[];
  history: TicketStatusHistoryRow[];
  reassignments: TicketReassignmentRow[];
  referrals: TicketReferralRow[];
  operationalAssessment: OperationalAssessment | null;
  // Manuscript revision Phase 3, step 3d.
  mergedInto: TicketMergedInto | null;
  mergedFrom: number[];
}

// Per-report Remove / Move on a multi-report active ticket (manuscript
// revision Phase 3, step 3d). Remove's availability and the eligible Move
// targets come from the related-candidates response, which applies the
// server's own grouping rules for this viewer.
interface ReportGrouping {
  ticketId: number;
  removeBlocked: string | null;
  moveTargets: RelatedTicketCandidate[];
  moveBlocked: string | null;
}

async function TicketDetailData({ ticketId, from }: { ticketId: number; from: string | undefined }) {
  let data: TicketDetailResponse | null;
  let priorityContext: TicketPriorityContext | null = null;
  let workOrders: WorkOrderRow[] = [];
  try {
    // NestJS's GET /admin/tickets/:id recomputes before reading, matching
    // this page's original SSR behavior.
    data = await apiGetOptional<TicketDetailResponse>(`/admin/tickets/${ticketId}`, [401, 404]);
    if (data && ACTIVE_STATUSES.includes(data.ticket.status) && data.ticket.merged_into_ticket_id === null) {
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

  // Suggested related tickets (manuscript revision Phase 3, step 3c), fetched
  // on their own so a failure only affects that panel.
  let related: RelatedTicketCandidates | null = null;
  try {
    related = await apiGetOptional<RelatedTicketCandidates>(`/admin/tickets/${ticketId}/related-candidates`, [401, 404]);
  } catch {
    related = null;
  }

  const { ticket, reports, history, reassignments, referrals, operationalAssessment, mergedInto, mergedFrom } = data;
  // A merged-away ticket stays viewable as history, with no actions
  // (manuscript revision Phase 3, step 3d; the API refuses them too).
  const mergedAway = ticket.merged_into_ticket_id !== null;
  const grouping = reportGrouping(ticket, reports.length, related);

  // Only trust a same-origin queue URL forwarded from the ticket list —
  // never redirect off /admin/tickets based on an arbitrary query param.
  const backHref = from && from.startsWith("/admin/tickets") ? from : "/admin/tickets";
  const nextStatus = NEXT_STATUS[ticket.status];
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
          {ticket.status === "Resolved" && ticket.resolution_outcome && (
            <Badge className="bg-line-100 text-ink-700" variant="outline">
              Outcome: {RESOLUTION_OUTCOME_LABEL[ticket.resolution_outcome]}
            </Badge>
          )}
          {/* Manuscript revision Phase 1, step 5: the header shows Operational
              Priority (lib/utils/ui/priority.ts bands), not Hazard Urgency. */}
          <Badge className={priorityBandClass(ticket.priority_index)} variant="outline">
            Operational Priority <span className="font-mono tabular-nums">{ticket.priority_index ?? "—"}</span> · {priorityBandLabel(ticket.priority_index)}
          </Badge>
          {ticket.disputed_at && (
            <Badge className="bg-red-50 text-red-700" variant="outline">
              Disputed {new Date(ticket.disputed_at).toLocaleDateString()}
            </Badge>
          )}
          {/* Old combined drainage ticket (migration 0035, handoff Decision 13);
              the correction itself arrives in Phase 3. */}
          {ticket.category_review_required && (
            <Badge
              className="border-warning-edge bg-warning-tint text-warning-ink"
              title="Category from before the manuscript split; to be corrected by staff."
              variant="outline"
            >
              Category review needed
            </Badge>
          )}
        </div>
        <p className="mt-1.5 text-sm text-ink-500">
          {ticket.barangay_name} · {ticket.assigned_office}
          {ticket.initial_assigned_office !== ticket.assigned_office && <> · Initially routed to {ticket.initial_assigned_office}</>} ·{" "}
          {mergedAway ? (
            <>Reports moved to Ticket #{ticket.merged_into_ticket_id}</>
          ) : (
            <>
              {ticket.member_count} report{ticket.member_count === 1 ? "" : "s"} merged
            </>
          )}
          {primaryReport && <> · First reported {new Date(primaryReport.created_at).toLocaleString()}</>}
        </p>
        {mergedFrom.length > 0 && (
          <p className="mt-1 text-sm text-ink-700" data-testid="merged-from">
            Includes reports merged from{" "}
            {mergedFrom.map((id, i) => (
              <span key={id}>
                {i > 0 && ", "}
                <Link className="text-brand-600 hover:text-brand-700 hover:underline" href={`/admin/tickets/${id}`}>
                  Ticket #{id}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>

      {mergedInto && (
        <div className="rounded-lg border border-warning-edge bg-warning-tint p-4 text-sm text-warning-ink" data-testid="merged-into-banner" role="status">
          <p>
            Merged into{" "}
            <Link className="font-medium underline" href={`/admin/tickets/${mergedInto.ticketId}`}>
              Ticket #{mergedInto.ticketId}
            </Link>
            {mergedInto.mergedAt && <> on {new Date(mergedInto.mergedAt).toLocaleDateString()}</>}
            {mergedInto.mergedByName && <> by {mergedInto.mergedByName}</>}. Reason: {mergedInto.reason ?? "—"}
          </p>
          <p className="mt-1 text-xs">This ticket is read-only history. Its reports continue on Ticket #{mergedInto.ticketId}.</p>
        </div>
      )}

      <HorizontalStatusTracker
        createdAt={ticket.created_at}
        currentStatus={ticket.status}
        history={history}
        nextStatus={mergedAway ? undefined : nextStatus}
        readOnlyNote={mergedAway ? `Read-only: merged into Ticket #${ticket.merged_into_ticket_id}.` : undefined}
        ticketId={ticket.id}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Location</p>
              {/* isolate keeps Leaflet's pane z-indexes below dialogs. */}
              <div className="isolate h-72 overflow-hidden rounded-lg border border-line-100">
                <TicketLocationMapLoader barangayGeoJson={barangayGeometry} lat={ticket.lat} lng={ticket.lng} />
              </div>
              <p className="mt-2 text-xs text-ink-500">
                {ticket.barangay_name} · {ticket.lat.toFixed(5)}, {ticket.lng.toFixed(5)}
              </p>
            </CardContent>
          </Card>

          <EvidenceCard grouping={grouping} primaryReport={primaryReport} reportCount={reports.length} reports={reports} />

          {!mergedAway && (
            <Card>
              <CardContent className="p-4">
                <RelatedTicketsPanel linkTo="ticket" related={related} />
              </CardContent>
            </Card>
          )}

          {ticket.resolution_image_url && primaryReport && (
            <BeforeAfterCard afterUrl={ticket.resolution_image_url} beforeUrl={primaryReport.image_url} notes={ticket.resolution_notes} title={primaryReport.title} />
          )}

          {ticket.disputed_at && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <p className="text-xs font-semibold tracking-wide text-red-700 uppercase">
                  Citizen reports issue not fixed
                </p>
                <p className="mt-1 text-xs text-red-700/80">Disputed {new Date(ticket.disputed_at).toLocaleString()}</p>
                {ticket.dispute_reason && <p className="mt-2 text-sm text-red-900">{ticket.dispute_reason}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          {!mergedAway && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Assignment</p>
                <Badge className={ticket.direct_responsibility ? "bg-line-100 text-ink-700" : "bg-amber-50 text-amber-800 border border-amber-200"} variant="outline">
                  {ticket.direct_responsibility ? "Direct responsibility" : "Referral — coordinate externally"}
                </Badge>
              </div>
              <AssignmentPanel currentOffice={ticket.assigned_office} ticketId={ticket.id} />
            </CardContent>
          </Card>
          )}

          {!mergedAway && !ticket.direct_responsibility && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Referral</p>
                <ReferralPanel ticketId={ticket.id} />
              </CardContent>
            </Card>
          )}

          {!mergedAway && ACTIVE_STATUSES.includes(ticket.status) && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Reject</p>
                <RejectTicketPanel ticketId={ticket.id} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <WorkOrdersPanel initialWorkOrders={workOrders} office={ticket.assigned_office as "MEO" | "MDRRMO"} readOnly={mergedAway} ticketId={ticket.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <OperationalAssessmentPanel assessment={operationalAssessment} readOnly={mergedAway} ticketId={ticket.id} />
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
                  <ScoringTab priorityContext={priorityContext} ticket={ticket} />
                </TabsContent>
                <TabsContent className="pt-4" value="timeline">
                  <TimelineTab createdAt={ticket.created_at} history={history} reassignments={reassignments} referrals={referrals} />
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

function reportGrouping(
  ticket: TicketDetail,
  reportCount: number,
  related: RelatedTicketCandidates | null,
): ReportGrouping | null {
  if (ticket.merged_into_ticket_id !== null || !ACTIVE_STATUSES.includes(ticket.status) || reportCount < 2) return null;
  const moveTargets = related?.candidates.filter((c) => c.blockedReasons.moveReportHere === null) ?? [];
  let moveBlocked: string | null = null;
  if (moveTargets.length === 0) {
    if (related === null) moveBlocked = "Possibly related tickets couldn't load, so there is no ticket to move it to.";
    else if (related.candidates.length === 0) moveBlocked = `No active ${ticket.category} ticket within ${related.radiusM} m to move it to.`;
    else moveBlocked = [...new Set(related.candidates.map((c) => c.blockedReasons.moveReportHere))].join(" ");
  }
  return {
    ticketId: ticket.id,
    removeBlocked: related?.viewed.blockedReasons.removeReport ?? null,
    moveTargets,
    moveBlocked,
  };
}

function EvidenceCard({
  primaryReport,
  reportCount,
  reports,
  grouping,
}: {
  primaryReport: TicketReport | undefined;
  reportCount: number;
  reports: TicketReport[];
  grouping: ReportGrouping | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Evidence &amp; reports ({reportCount})</p>
        {primaryReport?.description && <p className="mt-2 text-sm text-ink-700">{primaryReport.description}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {reports.map((report) => (
            <ReportCard
              actions={
                grouping && (
                  <ReportGroupingActions
                    moveBlocked={grouping.moveBlocked}
                    moveTargets={grouping.moveTargets}
                    removeBlocked={grouping.removeBlocked}
                    report={report}
                    ticketId={grouping.ticketId}
                  />
                )
              }
              key={report.id}
              report={report}
            />
          ))}
          {reports.length === 0 && <p className="text-sm text-ink-400">No member reports on this ticket.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard({ report, actions }: { report: TicketReport; actions?: ReactNode }) {
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
  if (report.location_mismatch_m !== null) metaParts.push(`${report.location_mismatch_m.toFixed(0)}m from EXIF GPS`);

  const flags = report.flags ?? [];

  return (
    <div className="rounded-lg border border-line-100 p-3" data-testid={`report-card-${report.id}`}>
      <ImageLightbox
        alt={`Hazard evidence photo submitted for "${report.title}", reported ${new Date(report.created_at).toLocaleDateString()}`}
        src={report.image_url}
      />
      <p className="mt-2 text-sm font-medium text-ink-900">{report.title}</p>
      <p className="font-mono text-xs text-ink-500">{report.tracking_reference}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{report.citizen_severity}</Badge>
        {report.moderation_status && <Badge variant="outline">{moderationStatusLabel(report.moderation_status)}</Badge>}
        {flags.map((flag) => (
          <FlagBadge flag={flag} key={flag} />
        ))}
      </div>
      {metaParts.length > 0 && <p className="mt-1.5 text-xs text-ink-400">{metaParts.join(" · ")}</p>}
      {actions}
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

// Manuscript revision Phase 1, step 5: the Hazard Urgency card (score,
// elevation/rainfall/cluster bars, live rain rate) is retired. Operational
// Priority is the only system score shown. Its factor table needs the live
// priority context, which is only fetched while the ticket is active; a
// Resolved or Rejected ticket shows its last stored value without it.
function ScoringTab({
  ticket,
  priorityContext,
}: {
  ticket: TicketDetail;
  priorityContext: TicketPriorityContext | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Operational Priority (how soon to act)</p>
      <p className="text-[11px] text-ink-400">System generated</p>
      <p className="mt-0.5 text-xs text-ink-400">Citizen-reported severity + ticket age + barangay density.</p>
      <div className="mt-3 flex items-baseline gap-2">
        <Badge className={priorityBandClass(ticket.priority_index)} variant="outline">
          <span className="font-mono tabular-nums">{ticket.priority_index ?? "—"}</span> · {priorityBandLabel(ticket.priority_index)}
        </Badge>
      </div>
      {priorityContext && (
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
              { label: "Citizen-reported severity weight", factor: priorityContext.breakdown.severityFactor, contribution: priorityContext.breakdown.severityContribution, note: priorityContext.breakdown.severity },
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
  referrals,
}: {
  createdAt: string;
  history: TicketStatusHistoryRow[];
  reassignments: TicketReassignmentRow[];
  referrals: TicketReferralRow[];
}) {
  const entries: TimelineEntry[] = [
    { key: "created", timestamp: createdAt, description: "Ticket created (Reported)", actor: null },
    ...history.map((h, i) => ({ key: `status-${i}`, timestamp: h.changed_at, description: `Status changed to ${h.status}`, actor: h.admin_name })),
    ...reassignments.map((r, i) => ({ key: `reassign-${i}`, timestamp: r.reassigned_at, description: `Reassigned from ${r.from_office} to ${r.to_office}`, actor: r.admin_name })),
    ...referrals.map((r, i) => ({ key: `referral-${i}`, timestamp: r.referred_at, description: `Referral recorded — ${r.agency}${r.note ? `: ${r.note}` : ""}`, actor: r.admin_name })),
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
