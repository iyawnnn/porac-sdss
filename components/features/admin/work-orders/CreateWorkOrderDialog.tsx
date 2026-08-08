"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function emptyDraft(ticketId?: number) {
  return { ticketId: ticketId ? String(ticketId) : "", title: "", notes: "", dueDate: "" };
}

// ticketId is fixed when opened from Ticket Detail (field hidden); left
// blank and editable when opened from the standalone /admin/work-orders
// list, which isn't scoped to one ticket.
export function CreateWorkOrderDialog({
  ticketId,
  onCreated,
}: {
  ticketId?: number;
  onCreated: (workOrder: WorkOrderRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(ticketId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setDraft(emptyDraft(ticketId));
    setError("");
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/admin/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketId ?? Number(draft.ticketId),
        title: draft.title,
        notes: draft.notes || null,
        dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : null,
      }),
    });

    if (res.ok) {
      const created = (await res.json()) as WorkOrderRow;
      onCreated(created);
      resetAndClose();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not create work order.");
    }
    setSubmitting(false);
  }

  return (
    <Dialog onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New Work Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New work order</DialogTitle>
          <DialogDescription>
            Tracks the field work needed to resolve {ticketId ? `Ticket #${ticketId}` : "a ticket"}. Assigned office follows the ticket automatically.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          {!ticketId && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-ticket-id">Ticket ID</label>
              <Input
                id="wo-ticket-id"
                min={1}
                onChange={(e) => setDraft((d) => ({ ...d, ticketId: e.target.value }))}
                required
                type="number"
                value={draft.ticketId}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-title">Title</label>
            <Input id="wo-title" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required value={draft.title} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-notes">Notes (internal, never shown to citizens)</label>
            <Textarea id="wo-notes" onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={3} value={draft.notes} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-due-date">Due date (optional)</label>
            <Input id="wo-due-date" onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} type="date" value={draft.dueDate} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button disabled={submitting} type="submit">{submitting ? "Creating…" : "Create work order"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
