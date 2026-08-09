"use client";

import { useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDueState } from "./WorkOrderStatusBadge";

function toDateInputValue(dueDate: string | null): string {
  return dueDate ? new Date(dueDate).toISOString().slice(0, 10) : "";
}

const DUE_STATE_CLASS: Record<string, string> = {
  overdue: "text-destructive font-medium",
  due_today: "text-amber-600 font-medium",
};

export function WorkOrderDueDateEditor({
  workOrder,
  onUpdated,
}: {
  workOrder: WorkOrderRow;
  onUpdated: (workOrder: WorkOrderRow) => void;
}) {
  // Local, optimistic value — mirrors workOrder.due_date (reset during
  // render, React's documented pattern for syncing state from a prop
  // change, rather than a useEffect) but isn't overwritten by the still-old
  // prop while a save is in flight — setSaving alone would otherwise force
  // a re-render that reads the stale prop and visually reverts the input
  // mid-save.
  const [value, setValue] = useState(() => toDateInputValue(workOrder.due_date));
  const [lastSyncedDueDate, setLastSyncedDueDate] = useState(workOrder.due_date);
  const [saving, setSaving] = useState(false);
  const dueState = getDueState(workOrder.due_date, workOrder.status);

  if (workOrder.due_date !== lastSyncedDueDate) {
    setLastSyncedDueDate(workOrder.due_date);
    setValue(toDateInputValue(workOrder.due_date));
  }

  async function save(dueDate: string) {
    setSaving(true);
    setValue(dueDate);
    // finally, not a trailing setSaving(false) — a thrown network error or a
    // non-OK response with an unparsable body would otherwise leave saving
    // stuck true forever, permanently disabling the input and Clear button.
    try {
      const res = await fetch(`/api/admin/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: dueDate ? new Date(dueDate).toISOString() : null }),
      });
      if (res.ok) {
        onUpdated((await res.json()) as WorkOrderRow);
      } else {
        setValue(toDateInputValue(workOrder.due_date));
      }
    } finally {
      setSaving(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (next === value) return;
    void save(next);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        aria-label={`Due date for work order #${workOrder.id}`}
        className={"h-8 w-36 text-xs " + (DUE_STATE_CLASS[dueState] ?? "")}
        disabled={saving}
        onChange={handleChange}
        type="date"
        value={value}
      />
      {value && (
        <Button
          aria-label={`Clear due date for work order #${workOrder.id}`}
          disabled={saving}
          onClick={() => save("")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
      )}
      {dueState === "overdue" && <span className="text-xs font-medium text-destructive">Overdue</span>}
      {dueState === "due_today" && <span className="text-xs font-medium text-amber-600">Due today</span>}
    </div>
  );
}
