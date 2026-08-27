"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import type { AdminDirectoryRow } from "@/lib/types/admin-directory";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketComboboxSelect } from "./TicketComboboxSelect";

const UNASSIGNED = "unassigned";

function emptyDraft() {
  return { title: "", notes: "", dueDate: "", assignedAdminId: UNASSIGNED };
}

// ticketId is fixed when opened from Ticket Detail (field hidden); picked
// from a searchable list when opened from the standalone /admin/work-orders
// page, which isn't scoped to one ticket.
//
// The assignee picker needs to know the work order's office before it can
// fetch a scoped directory. `office` covers the Ticket Detail case (the
// ticket's real office is already known); `sessionOffice` covers an MEO/
// MDRRMO caller on the standalone page (their own office is deterministic
// regardless of ticket). On the standalone page the selected ticket's own
// assigned_office is the third and final fallback — it's deterministic once
// a ticket is picked, so system admins no longer need a manual office
// picker. The real office is still validated server-side once submitted.
export function CreateWorkOrderDialog({
  ticketId,
  office,
  sessionOffice,
  onCreated,
}: {
  ticketId?: number;
  office?: "MEO" | "MDRRMO";
  sessionOffice?: "MEO" | "MDRRMO";
  onCreated: (workOrder: WorkOrderRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [selectedTicket, setSelectedTicket] = useState<AdminTicketRow | null>(null);
  const [directory, setDirectory] = useState<AdminDirectoryRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const effectiveOffice = office ?? sessionOffice ?? (selectedTicket?.assigned_office as "MEO" | "MDRRMO" | undefined);
  const resolvedTicketId = ticketId ?? selectedTicket?.id;

  useEffect(() => {
    // No reset to [] here when effectiveOffice is falsy — directory
    // already starts empty, and the UI never lets effectiveOffice revert
    // from set back to unset (the manual office picker only offers MEO/
    // MDRRMO, no "clear" option).
    if (!effectiveOffice) return;
    let cancelled = false;
    fetch(`/api/admin/admins/directory?office=${effectiveOffice}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminDirectoryRow[]) => {
        if (!cancelled) setDirectory(data);
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveOffice]);

  function resetAndClose() {
    setDraft(emptyDraft());
    setSelectedTicket(null);
    setError("");
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolvedTicketId) return;
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/admin/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: resolvedTicketId,
        title: draft.title,
        notes: draft.notes || null,
        assignedAdminId: draft.assignedAdminId === UNASSIGNED ? null : Number(draft.assignedAdminId),
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
              <label className="text-xs font-medium text-muted-foreground">Ticket</label>
              <TicketComboboxSelect
                onChange={(ticket) => {
                  setSelectedTicket(ticket);
                  setDraft((d) => ({ ...d, assignedAdminId: UNASSIGNED }));
                }}
                value={selectedTicket}
              />
              {selectedTicket && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{selectedTicket.barangay_name}</span>
                  <span
                    className={`inline-flex h-5 items-center rounded-md px-2 font-semibold tracking-[0.02em] whitespace-nowrap ${getUrgencyBadgeConfig(selectedTicket.priority_score).className}`}
                  >
                    {getUrgencyBadgeConfig(selectedTicket.priority_score).label}
                  </span>
                  <span>{selectedTicket.assigned_office}</span>
                </p>
              )}
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
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-assignee">Assigned admin</label>
            <Select
              disabled={!effectiveOffice}
              onValueChange={(v) => setDraft((d) => ({ ...d, assignedAdminId: v }))}
              value={draft.assignedAdminId}
            >
              <SelectTrigger className="w-full" id="wo-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned / Office-wide</SelectItem>
                {directory.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button disabled={submitting || !resolvedTicketId} type="submit">{submitting ? "Creating…" : "Create work order"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
