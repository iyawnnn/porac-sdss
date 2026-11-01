"use client";

import { useState } from "react";
import type { WorkOrderRow, WorkOrderStatus } from "@/lib/types/admin-work-orders";
import { WORK_ORDER_NEXT_STATUS, isFinalWorkOrder } from "@/lib/types/admin-work-orders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkOrderStatusBadge } from "./WorkOrderStatusBadge";
import { CancelWorkOrderDialog } from "./CancelWorkOrderDialog";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancel…",
};

// Only the moves the API allows (manuscript revision Phase 5, step 5b):
// the current status, its one next status (pending -> in progress ->
// completed), and Cancel, which opens the Cancel dialog for a reason.
// Completed and Cancelled are final: just the badge, no control.
export function WorkOrderStatusSelect({
  workOrder,
  onUpdated,
}: {
  workOrder: WorkOrderRow;
  onUpdated: (workOrder: WorkOrderRow) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState("");

  if (isFinalWorkOrder(workOrder.status)) {
    return <WorkOrderStatusBadge status={workOrder.status} />;
  }

  const next = WORK_ORDER_NEXT_STATUS[workOrder.status];
  const options: WorkOrderStatus[] = [workOrder.status, ...(next ? [next] : []), "cancelled"];

  async function handleChange(status: string) {
    if (status === workOrder.status) return;
    if (status === "cancelled") {
      setCancelOpen(true);
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/work-orders/${workOrder.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      onUpdated((await res.json()) as WorkOrderRow);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not change the status.");
    }
    setSaving(false);
  }

  return (
    <>
      <Select disabled={saving} onValueChange={handleChange} value={workOrder.status}>
        <SelectTrigger aria-label={`Status for work order #${workOrder.id}`} className="h-8 w-36" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {s === workOrder.status ? STATUS_LABELS[s].replace("…", "") : STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <CancelWorkOrderDialog
        onCancelled={onUpdated}
        onOpenChange={setCancelOpen}
        open={cancelOpen}
        workOrder={workOrder}
      />
    </>
  );
}
