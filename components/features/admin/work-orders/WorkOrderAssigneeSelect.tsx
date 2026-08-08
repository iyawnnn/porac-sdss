"use client";

import { useEffect, useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import type { AdminDirectoryRow } from "@/lib/types/admin-directory";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNASSIGNED = "unassigned";

// Office-scoped by the work order's own (fixed) assigned_office — never the
// caller's office — so this reflects exactly who GET /admin/admins/directory
// would let a caller assign here, on the same office the backend validates
// assignedAdminId against.
export function WorkOrderAssigneeSelect({
  workOrder,
  onUpdated,
}: {
  workOrder: WorkOrderRow;
  onUpdated: (workOrder: WorkOrderRow) => void;
}) {
  const [directory, setDirectory] = useState<AdminDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // No setLoading(true) here — the initial state above already covers it,
    // and assigned_office (the effect's only dependency) never changes
    // post-creation, so this effect only ever meaningfully runs once.
    let cancelled = false;
    fetch(`/api/admin/admins/directory?office=${workOrder.assigned_office}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminDirectoryRow[]) => {
        if (!cancelled) setDirectory(data);
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workOrder.assigned_office]);

  async function handleChange(value: string) {
    const assignedAdminId = value === UNASSIGNED ? null : Number(value);
    if (assignedAdminId === workOrder.assigned_admin_id) return;
    setSaving(true);
    const res = await fetch(`/api/admin/work-orders/${workOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedAdminId }),
    });
    if (res.ok) {
      onUpdated((await res.json()) as WorkOrderRow);
    }
    setSaving(false);
  }

  return (
    <Select
      disabled={loading || saving}
      onValueChange={handleChange}
      value={workOrder.assigned_admin_id != null ? String(workOrder.assigned_admin_id) : UNASSIGNED}
    >
      <SelectTrigger aria-label={`Assigned admin for work order #${workOrder.id}`} className="h-8 w-48" size="sm">
        <SelectValue placeholder="Unassigned / Office-wide" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned / Office-wide</SelectItem>
        {directory.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
