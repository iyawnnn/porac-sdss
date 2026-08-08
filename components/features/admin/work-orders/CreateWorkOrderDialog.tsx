"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { WorkOrderRow } from "@/lib/types/admin-work-orders";
import type { AdminDirectoryRow } from "@/lib/types/admin-directory";
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

const UNASSIGNED = "unassigned";

function emptyDraft(ticketId?: number) {
  return { ticketId: ticketId ? String(ticketId) : "", title: "", notes: "", dueDate: "", assignedAdminId: UNASSIGNED };
}

// ticketId is fixed when opened from Ticket Detail (field hidden); left
// blank and editable when opened from the standalone /admin/work-orders
// list, which isn't scoped to one ticket.
//
// The assignee picker needs to know the work order's office before it can
// fetch a scoped directory. `office` covers the Ticket Detail case (the
// ticket's real office is already known); `sessionOffice` covers an MEO/
// MDRRMO caller on the standalone list (their own office is deterministic
// regardless of ticket). Only a system admin creating from the standalone
// list, with neither known, gets an explicit office selector — the real
// office is still validated server-side once the ticket is submitted.
export function CreateWorkOrderDialog({
  ticketId,
  office,
  sessionOffice,
  isSystemAdmin = false,
  onCreated,
}: {
  ticketId?: number;
  office?: "MEO" | "MDRRMO";
  sessionOffice?: "MEO" | "MDRRMO";
  isSystemAdmin?: boolean;
  onCreated: (workOrder: WorkOrderRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft(ticketId));
  const [manualOffice, setManualOffice] = useState<"MEO" | "MDRRMO" | "">("");
  const [directory, setDirectory] = useState<AdminDirectoryRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const needsManualOffice = isSystemAdmin && !office && !sessionOffice;
  const effectiveOffice = office ?? sessionOffice ?? (manualOffice || undefined);

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
    setDraft(emptyDraft(ticketId));
    setManualOffice("");
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
          {needsManualOffice && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="wo-office">Work order office</label>
              <Select
                onValueChange={(v) => {
                  setManualOffice(v as "MEO" | "MDRRMO");
                  // A new office invalidates whatever was picked under the old one.
                  setDraft((d) => ({ ...d, assignedAdminId: UNASSIGNED }));
                }}
                value={manualOffice}
              >
                <SelectTrigger className="w-full" id="wo-office"><SelectValue placeholder="Pick an office to assign staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEO">MEO</SelectItem>
                  <SelectItem value="MDRRMO">MDRRMO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Only used to filter the assignee list below — the ticket&apos;s real office still governs at creation.</p>
            </div>
          )}
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
            <Button disabled={submitting} type="submit">{submitting ? "Creating…" : "Create work order"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
