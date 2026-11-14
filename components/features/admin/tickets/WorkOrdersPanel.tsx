"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSESSMENT_REQUIRED_MESSAGE, isFinalWorkOrder, type WorkOrderRow } from "@/lib/types/admin-work-orders";
import { CreateWorkOrderDialog } from "@/components/features/admin/work-orders/CreateWorkOrderDialog";
import { WorkOrderStatusBadge } from "@/components/features/admin/work-orders/WorkOrderStatusBadge";
import { WorkOrderStatusSelect } from "@/components/features/admin/work-orders/WorkOrderStatusSelect";
import { WorkOrderAssigneeSelect } from "@/components/features/admin/work-orders/WorkOrderAssigneeSelect";
import { WorkOrderDueDateEditor } from "@/components/features/admin/work-orders/WorkOrderDueDateEditor";
import { WorkOrderNotesEditor } from "@/components/features/admin/work-orders/WorkOrderNotesEditor";
import { WorkOrderFinalState } from "@/components/features/admin/work-orders/WorkOrderFinalState";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { reloadTicketDetail } from "./reloadTicketDetail";

// Internal-only panel — work orders (and their notes) never appear on any
// citizen-facing route. Only rendered on the admin Ticket Detail page.
export function WorkOrdersPanel({
  ticketId,
  office,
  initialWorkOrders,
  readOnly = false,
  hasAssessment = true,
}: {
  ticketId: number;
  office: "MEO" | "MDRRMO";
  initialWorkOrders: WorkOrderRow[];
  // A merged-away ticket (manuscript revision Phase 3, step 3d) or a
  // Rejected one (step 5b): its Work Orders stay listed as history, with
  // no create or edit controls. The API refuses both.
  readOnly?: boolean;
  // Step 5b: a ticket needs an Operational Assessment with observed
  // conditions before a Work Order can be created (the API enforces it).
  hasAssessment?: boolean;
}) {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState(initialWorkOrders);

  // A new Work Order, or one moving to another status, changes what the rest
  // of Ticket Detail allows (Reassign, Refer, resolving), so the page
  // re-renders; notes, assignee and due-date edits only update this panel.
  function handleCreated(created: WorkOrderRow) {
    setWorkOrders((prev) => [created, ...prev]);
    reloadTicketDetail(router);
  }
  function handleUpdated(updated: WorkOrderRow) {
    const statusChanged = workOrders.find((w) => w.id === updated.id)?.status !== updated.status;
    setWorkOrders((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    if (statusChanged) reloadTicketDetail(router);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Work orders ({workOrders.length})</p>
        {!readOnly && hasAssessment && <CreateWorkOrderDialog office={office} onCreated={handleCreated} ticketId={ticketId} />}
      </div>
      {!readOnly && !hasAssessment && (
        <p className="rounded-md border border-line-100 bg-muted/40 p-2 text-xs text-ink-700" data-testid="work-order-assessment-required">
          {ASSESSMENT_REQUIRED_MESSAGE}
        </p>
      )}
      {workOrders.length === 0 ? (
        <EmptyState className="items-start p-0 text-left" title="No work orders yet for this ticket." />
      ) : (
        <ul className="space-y-2">
          {workOrders.map((wo) => (
            <li className="scroll-mt-20 rounded-lg border border-line-100 p-3" data-testid={`work-order-${wo.id}`} id={`work-order-${wo.id}`} key={wo.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-ink-900">
                  <span className="text-ink-400">#{wo.id}</span> {wo.title}
                </p>
                <WorkOrderStatusBadge status={wo.status} />
              </div>
              {readOnly || isFinalWorkOrder(wo.status) ? (
                <>
                  {wo.notes && <p className="mt-1 text-xs whitespace-pre-wrap text-ink-500">{wo.notes}</p>}
                  <WorkOrderFinalState replacementHref={(id) => `#work-order-${id}`} workOrder={wo} />
                </>
              ) : (
                <>
                  <WorkOrderNotesEditor onUpdated={handleUpdated} workOrder={wo} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <WorkOrderStatusSelect onUpdated={handleUpdated} workOrder={wo} />
                    <WorkOrderAssigneeSelect onUpdated={handleUpdated} workOrder={wo} />
                    <WorkOrderDueDateEditor onUpdated={handleUpdated} workOrder={wo} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
