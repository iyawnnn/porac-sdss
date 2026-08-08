"use client";

import { useState } from "react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Internal-only progress notes — never rendered on any citizen-facing
// surface. See WorkOrdersPanel, the only place this is used.
export function WorkOrderNotesEditor({
  workOrder,
  onUpdated,
}: {
  workOrder: WorkOrderRow;
  onUpdated: (workOrder: WorkOrderRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workOrder.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/work-orders/${workOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: draft || null }),
    });
    if (res.ok) {
      onUpdated((await res.json()) as WorkOrderRow);
      setEditing(false);
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <button
        aria-label={`Edit notes for work order #${workOrder.id}`}
        className="mt-1.5 block w-full rounded-md p-1.5 text-left text-sm hover:bg-muted"
        onClick={() => {
          setDraft(workOrder.notes ?? "");
          setEditing(true);
        }}
        type="button"
      >
        {workOrder.notes ? (
          <span className="text-ink-700">{workOrder.notes}</span>
        ) : (
          <span className="text-muted-foreground italic">Add a progress note…</span>
        )}
      </button>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <Textarea
        aria-label={`Notes for work order #${workOrder.id}`}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Internal progress note (never shown to citizens)"
        rows={3}
        value={draft}
      />
      <div className="flex gap-1.5">
        <Button disabled={saving} onClick={save} size="sm" type="button">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button disabled={saving} onClick={() => setEditing(false)} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  );
}
