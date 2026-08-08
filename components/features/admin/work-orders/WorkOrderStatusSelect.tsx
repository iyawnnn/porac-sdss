"use client";

import { useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { WORK_ORDER_STATUSES } from "@/lib/types/admin-work-orders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function WorkOrderStatusSelect({
  workOrder,
  onUpdated,
}: {
  workOrder: WorkOrderRow;
  onUpdated: (workOrder: WorkOrderRow) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(status: string) {
    if (status === workOrder.status) return;
    setSaving(true);
    const res = await fetch(`/api/admin/work-orders/${workOrder.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      onUpdated((await res.json()) as WorkOrderRow);
    }
    setSaving(false);
  }

  return (
    <Select disabled={saving} onValueChange={handleChange} value={workOrder.status}>
      <SelectTrigger aria-label={`Status for work order #${workOrder.id}`} className="h-8 w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WORK_ORDER_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
