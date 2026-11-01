"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH,
  isFinalWorkOrder,
  type WorkOrderRow,
} from "@/lib/types/admin-work-orders";

const NO_REPLACEMENT = "none";

// Cancel a pending or in-progress Work Order (manuscript revision Phase 5,
// step 5b): a required reason, and optionally the Work Order of the same
// ticket that replaces it (only active ones are offered). Cancelling is
// final and never changes the ticket's status; the API enforces the same
// rules (POST /admin/work-orders/:id/cancel).
export function CancelWorkOrderDialog({
  workOrder,
  open,
  onOpenChange,
  onCancelled,
}: {
  workOrder: WorkOrderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: (workOrder: WorkOrderRow) => void;
}) {
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState(NO_REPLACEMENT);
  const [candidates, setCandidates] = useState<WorkOrderRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    fetch(`/api/admin/work-orders?ticketId=${workOrder.ticket_id}&status=all&limit=50`)
      .then((res) => (res.ok ? res.json() : { workOrders: [] }))
      .then((data: { workOrders: WorkOrderRow[] }) => {
        if (!ignore) {
          setCandidates(data.workOrders.filter((w) => w.id !== workOrder.id && !isFinalWorkOrder(w.status)));
        }
      })
      .catch(() => {
        if (!ignore) setCandidates([]);
      });
    return () => {
      ignore = true;
    };
  }, [open, workOrder.id, workOrder.ticket_id]);

  function close() {
    setReason("");
    setReplacement(NO_REPLACEMENT);
    setReasonError("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("A cancellation reason is required.");
      return;
    }
    setReasonError("");
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/admin/work-orders/${workOrder.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: trimmed,
        replacementWorkOrderId: replacement === NO_REPLACEMENT ? null : Number(replacement),
      }),
    });
    if (res.ok) {
      onCancelled((await res.json()) as WorkOrderRow);
      close();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not cancel the work order.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Work Order #{workOrder.id}</DialogTitle>
          <DialogDescription>
            &ldquo;{workOrder.title}&rdquo; becomes final: it can no longer be edited or reopened. The ticket&apos;s status
            does not change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-500">Reason (required)</p>
            <Textarea
              aria-describedby={reasonError ? "cancel-reason-error" : undefined}
              aria-invalid={reasonError ? true : undefined}
              aria-label="Cancellation reason"
              maxLength={WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError && e.target.value.trim()) setReasonError("");
              }}
              placeholder="Why is this work order being cancelled?"
              rows={3}
              value={reason}
            />
            {reasonError && (
              <p className="text-xs text-destructive" id="cancel-reason-error">{reasonError}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-500">Replaced by (optional)</p>
            <Select onValueChange={setReplacement} value={replacement}>
              <SelectTrigger aria-label="Replacement work order" className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REPLACEMENT}>No replacement</SelectItem>
                {candidates.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    #{w.id} {w.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={close} variant="outline">Keep Work Order</Button>
          <Button disabled={submitting} onClick={handleSubmit} variant="destructive">
            {submitting ? "Cancelling…" : "Cancel Work Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
