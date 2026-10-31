"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeftIcon, MapPinIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { FlagBadge } from "@/components/features/admin/flagged/FlagBadge";
import { priorityBandClass, priorityBandLabel } from "@/lib/utils/ui/priority";
import type { FocalIntakeDetail as FocalIntakeDetailData } from "@/lib/types/admin-focal-intake";
import type { RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";
import type { CorrectionAvailability } from "@/lib/types/admin-ticket-corrections";
import { distanceMeters } from "@/lib/utils/distance";
import { RelatedTicketsPanel } from "@/components/features/admin/tickets/RelatedTicketsPanel";
import { TicketCorrectionActions } from "@/components/features/admin/tickets/corrections/TicketCorrectionActions";
import { AcknowledgeDialog } from "@/components/features/admin/focal/dialogs/AcknowledgeDialog";
import { ReassignDialog } from "@/components/features/admin/tickets/routing/ReassignDialog";
import { ReferDialog } from "@/components/features/admin/tickets/routing/ReferDialog";
import { SeverityScreeningCard } from "@/components/features/admin/focal/SeverityScreeningCard";

const TicketLocationMapLoader = dynamic(() => import("@/components/features/admin/tickets/TicketLocationMapLoader"), { ssr: false });

// Every intake action is history only: the old general screening action
// (replaced by severity screening in manuscript revision Phase 3, step 3f)
// and Forward / Escalate (replaced by Reassign / Refer in Phase 5, step 5a).
const ACTION_LABEL: Record<string, string> = {
  screened: "Initial screening completed",
  forwarded: "Forwarded to another office",
  escalated: "Escalated for priority attention",
};

type DialogKey = "acknowledge" | "reassign" | "refer" | null;

// Central Monitoring / Focal Personnel intake detail — a separate concept
// from the MEO/MDRRMO operational Ticket Detail (see
// api/src/admin/focal-intake.service.ts's own docblock). All data on this
// page comes from the FocalIntakeDetail prop, always refreshed via
// router.refresh() after a mutation (never local optimistic state) so the
// UI can never contradict server truth.
export function FocalIntakeDetail({
  report,
  related,
  correction,
}: {
  report: FocalIntakeDetailData;
  related: RelatedTicketCandidates | null;
  correction: CorrectionAvailability | null;
}) {
  const [openDialog, setOpenDialog] = useState<DialogKey>(null);
  const routingBlocked = report.routing.blockedReason !== null;
  // The map shows the ticket's current location; the citizen's pin is
  // listed when a staff correction moved the ticket away from it
  // (manuscript revision Phase 3, step 3e).
  const pinDistance = Math.round(
    distanceMeters({ lat: report.lat, lng: report.lng }, { lat: report.ticketLat, lng: report.ticketLng }),
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <Link className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href="/admin/focal/intake">
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          Back to Intake Queue
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold">{report.reportReference} &middot; {report.category}</h1>
          <Badge variant="outline">{report.intakeState}</Badge>
          {/* Operational Priority since manuscript revision Phase 1, step 6b (Hazard Urgency before). */}
          <span className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] ${priorityBandClass(report.operationalPriority)}`} title="Operational Priority">
            {priorityBandLabel(report.operationalPriority).toUpperCase()} <span className="mx-1 opacity-60">&middot;</span> <span className="font-mono tabular-nums">{report.operationalPriority ?? "—"}</span>
          </span>
          <Badge title="Related operational ticket" variant="secondary">
            Related: {report.linkedTicketReference}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {report.barangayName} &middot; routed to {report.routedOffice} &middot; ticket status {report.ticketStatus}
        </p>
      </div>

      {/* Focal's intake actions only — no Advance Status/Resolve/Reject/
          Create Work Order affordances. Severity screening (the Severity
          screening card) replaced the old Initial Screening button in
          manuscript revision Phase 3, step 3f; Reassign and Refer replaced
          Forward and Escalate in Phase 5, step 5a, and are open to Focal
          only while the ticket is Reported with no active Work Order. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!!report.acknowledgedAt} onClick={() => setOpenDialog("acknowledge")}>
          {report.acknowledgedAt ? "Acknowledged" : "Acknowledge Report"}
        </Button>
        <Button disabled={routingBlocked} onClick={() => setOpenDialog("reassign")} variant="outline">Reassign</Button>
        <Button disabled={routingBlocked} onClick={() => setOpenDialog("refer")} variant="outline">Refer</Button>
      </div>
      {report.routing.blockedReason && (
        <p className="text-xs text-muted-foreground" data-testid="routing-blocked">
          {report.routing.blockedReason}
        </p>
      )}
      {correction && <TicketCorrectionActions afterMove="refresh" availability={correction} />}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Citizen Report</p>
              <p className="text-sm">{report.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">Citizen severity: {report.citizenSeverity}</Badge>
                {report.memberCount > 1 && <Badge variant="outline">{report.memberCount} reports merged</Badge>}
              </div>
              {report.submittedCategory !== report.category && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="citizen-category">
                  Citizen-reported category: {report.submittedCategory}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Location</p>
              {/* isolate keeps Leaflet's pane z-indexes below dialogs. */}
              <div className="isolate h-64 overflow-hidden rounded-lg border border-border">
                <TicketLocationMapLoader barangayGeoJson={null} lat={report.ticketLat} lng={report.ticketLng} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="ticket-location">
                <span className="inline-flex items-center gap-1"><MapPinIcon aria-hidden="true" className="size-3.5" />{report.barangayName}</span>
                <span>{report.ticketLat.toFixed(5)}, {report.ticketLng.toFixed(5)}</span>
              </p>
              {pinDistance >= 1 && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="citizen-pin">
                  Citizen pin: {report.lat.toFixed(5)}, {report.lng.toFixed(5)} · {pinDistance} m from the ticket location
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <RelatedTicketsPanel linkTo="focal-intake" related={related} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Integrity Review</p>
              {report.flags.length === 0 ? (
                <EmptyState description="This report has not been flagged for review." icon={ShieldCheckIcon} title="No integrity flags" />
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {report.flags.map((flag) => <FlagBadge flag={flag} key={flag} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Decision Support</p>

              {/* The Hazard Urgency block was removed in manuscript revision Phase 1, step 6b. */}
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Operational Priority</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold tracking-[0.02em] ${priorityBandClass(report.operationalPriority)}`}>
                    {priorityBandLabel(report.operationalPriority).toUpperCase()}
                  </span>
                  <span className="font-mono text-lg font-semibold tabular-nums">{report.operationalPriority ?? "—"} / 100</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">System-generated administrative queue recommendation — citizen severity, ticket age and barangay density.</p>
              </div>
            </CardContent>
          </Card>

          <SeverityScreeningCard key={`${report.severityScreening.status}-${report.severityScreening.screenedAt}`} report={report} />

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Intake Status</p>
              <Badge variant="outline">{report.intakeState}</Badge>
              <p className="mt-2 text-xs text-muted-foreground">
                An intake workflow state — not the ticket&apos;s Reported / Under Review / In Progress / Resolved / Rejected lifecycle.
              </p>
              {report.acknowledgedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Acknowledged by {report.acknowledgedByName ?? "Central Monitoring"} &middot; {new Date(report.acknowledgedAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Intake Activity</p>
              <ol className="space-y-2.5">
                <li className="flex gap-2 text-sm">
                  <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p>Report submitted</p>
                    <p className="text-xs text-muted-foreground">{new Date(report.submittedAt).toLocaleString()}</p>
                  </div>
                </li>
                {report.acknowledgedAt && (
                  <li className="flex gap-2 text-sm">
                    <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p>Acknowledged by municipal monitoring</p>
                      <p className="text-xs text-muted-foreground">{new Date(report.acknowledgedAt).toLocaleString()}</p>
                    </div>
                  </li>
                )}
                {report.activity.map((entry, i) => (
                  <li className="flex gap-2 text-sm" key={`${entry.actionType}-${i}`}>
                    <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p>{ACTION_LABEL[entry.actionType] ?? entry.actionType}{entry.remarks ? ` — "${entry.remarks}"` : ""}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}{entry.actorName ? ` · ${entry.actorName}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <AcknowledgeDialog onOpenChange={(o) => setOpenDialog(o ? "acknowledge" : null)} open={openDialog === "acknowledge"} report={report} />
      {!routingBlocked && (
        <>
          <ReassignDialog
            actionPath={`/api/admin/intake/${report.reportId}`}
            afterMove="refresh"
            currentOffice={report.routedOffice}
            key={`reassign-${report.routedOffice}`}
            onOpenChange={(o) => setOpenDialog(o ? "reassign" : null)}
            open={openDialog === "reassign"}
            ticketId={report.ticketId}
          />
          <ReferDialog
            actionPath={`/api/admin/intake/${report.reportId}`}
            onOpenChange={(o) => setOpenDialog(o ? "refer" : null)}
            open={openDialog === "refer"}
            ticketId={report.ticketId}
          />
        </>
      )}
    </div>
  );
}
