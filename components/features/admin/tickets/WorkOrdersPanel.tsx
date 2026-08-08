"use client";

import { useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { CreateWorkOrderDialog } from "@/components/features/admin/work-orders/CreateWorkOrderDialog";
import { WorkOrderStatusBadge } from "@/components/features/admin/work-orders/WorkOrderStatusBadge";
import { WorkOrderStatusSelect } from "@/components/features/admin/work-orders/WorkOrderStatusSelect";
import { WorkOrderAssigneeSelect } from "@/components/features/admin/work-orders/WorkOrderAssigneeSelect";

function formatDate(value: string | null): string {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
        <p className="text-sm text-ink-400">No work orders yet for this ticket.</p>
      ) : (
        <ul className="space-y-2">
          {workOrders.map((wo) => (
            <li className="rounded-lg border border-line-100 p-3" key={wo.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{wo.title}</p>
                  <p className="text-xs text-ink-400">Due: {formatDate(wo.due_date)}</p>
                </div>
                <WorkOrderStatusBadge status={wo.status} />
              </div>
              {wo.notes && <p className="mt-1.5 text-sm text-ink-700">{wo.notes}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <WorkOrderStatusSelect onUpdated={handleUpdated} workOrder={wo} />
                <WorkOrderAssigneeSelect onUpdated={handleUpdated} workOrder={wo} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
