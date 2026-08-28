"use client";

import { useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { CreateWorkOrderDialog } from "@/components/features/admin/work-orders/CreateWorkOrderDialog";
import { WorkOrderStatusBadge } from "@/components/features/admin/work-orders/WorkOrderStatusBadge";
import { WorkOrderStatusSelect } from "@/components/features/admin/work-orders/WorkOrderStatusSelect";
import { WorkOrderAssigneeSelect } from "@/components/features/admin/work-orders/WorkOrderAssigneeSelect";
import { WorkOrderDueDateEditor } from "@/components/features/admin/work-orders/WorkOrderDueDateEditor";
import { WorkOrderNotesEditor } from "@/components/features/admin/work-orders/WorkOrderNotesEditor";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";

// Internal-only panel — work orders (and their notes) never appear on any
// citizen-facing route. Only rendered on the admin Ticket Detail page.
export function WorkOrdersPanel({
  ticketId,
  office,
  initialWorkOrders,
}: {
  ticketId: number;
  office: "MEO" | "MDRRMO";
  initialWorkOrders: WorkOrderRow[];
}) {
  const [workOrders, setWorkOrders] = useState(initialWorkOrders);

  function handleCreated(created: WorkOrderRow) {
    setWorkOrders((prev) => [created, ...prev]);
  }
  function handleUpdated(updated: WorkOrderRow) {
    setWorkOrders((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Work orders ({workOrders.length})</p>
        <CreateWorkOrderDialog office={office} onCreated={handleCreated} ticketId={ticketId} />
      </div>
      {workOrders.length === 0 ? (
        <EmptyState className="items-start p-0 text-left" title="No work orders yet for this ticket." />
      ) : (
        <ul className="space-y-2">
          {workOrders.map((wo) => (
            <li className="rounded-lg border border-line-100 p-3" key={wo.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-ink-900">{wo.title}</p>
                <WorkOrderStatusBadge status={wo.status} />
              </div>
              <WorkOrderNotesEditor onUpdated={handleUpdated} workOrder={wo} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <WorkOrderStatusSelect onUpdated={handleUpdated} workOrder={wo} />
                <WorkOrderAssigneeSelect onUpdated={handleUpdated} workOrder={wo} />
                <WorkOrderDueDateEditor onUpdated={handleUpdated} workOrder={wo} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
