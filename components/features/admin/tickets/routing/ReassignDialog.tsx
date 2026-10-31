"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { postRouting, ROUTING_REASON_MAX_LENGTH } from "./postRouting";

type Office = "MEO" | "MDRRMO";
const OFFICES: Office[] = ["MEO", "MDRRMO"];

// Manual Reassign (manuscript pp. 43–44; manuscript revision Phase 5, step
// 5a): moves the ticket to the other office, with a required reason, and is
// recorded in routing_actions. The API re-checks the routing rule on submit,
// so a refusal here (403/409) means the situation changed after the page
// loaded; its message is shown as is.
//
// afterMove: what happens once the ticket has moved. Operational Personnel
// lose access to it, so the dialog says so and offers the queue; Focal sees
// every office and simply refreshes.
export function ReassignDialog({
  open,
  onOpenChange,
  actionPath,
  ticketId,
  currentOffice,
  afterMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionPath: string;
  ticketId: number;
  currentOffice: Office;
  afterMove: "leave" | "refresh";
}) {
  const router = useRouter();
  const otherOffice = OFFICES.find((o) => o !== currentOffice) ?? "MDRRMO";
  const [toOffice, setToOffice] = useState<Office>(otherOffice);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [moved, setMoved] = useState(false);

  function close() {
    setToOffice(otherOffice);
    setReason("");
    setReasonError("");
    setError("");
    setSubmitting(false);
    setMoved(false);
    onOpenChange(false);
  }

  async function confirm() {
    if (!reason.trim()) {
      setReasonError("A reason is required.");
      return;
    }
    setReasonError("");
    setError("");
    setSubmitting(true);
    const result = await postRouting(actionPath, "reassign", { toOffice, reason: reason.trim() });
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    if (afterMove === "leave") {
      setSubmitting(false);
      setMoved(true);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : moved ? router.push("/admin/tickets") : close())} open={open}>
      <DialogContent className="sm:max-w-md">
        {moved ? (
          <>
            <DialogHeader>
              <DialogTitle>Ticket #{ticketId} reassigned to {toOffice}</DialogTitle>
              <DialogDescription>
                The reassignment was recorded with your reason. The ticket now appears in {toOffice}&apos;s queue, and you no
                longer have access to it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => router.push("/admin/tickets")}>Back to ticket queue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reassign Ticket #{ticketId}</DialogTitle>
              <DialogDescription>
                Now with {currentOffice}. Moves the responsible office; the ticket&apos;s status does not change.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="reassign-destination">
                Reassign to
              </label>
              <Select onValueChange={(v) => setToOffice(v as Office)} value={toOffice}>
                <SelectTrigger aria-label="Reassign to" className="w-full" id="reassign-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFICES.filter((o) => o !== currentOffice).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="reassign-reason">
                Reason (required)
              </label>
              <Textarea
                aria-describedby={reasonError ? "reassign-reason-error" : undefined}
                aria-invalid={reasonError ? true : undefined}
                id="reassign-reason"
                maxLength={ROUTING_REASON_MAX_LENGTH}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError && e.target.value.trim()) setReasonError("");
                }}
                placeholder={`Why ${toOffice} is responsible for this ticket`}
                rows={3}
                value={reason}
              />
              {reasonError && (
                <p className="text-xs text-destructive" id="reassign-reason-error">
                  {reasonError}
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button disabled={submitting} onClick={close} variant="outline">
                Cancel
              </Button>
              <Button disabled={submitting} onClick={confirm}>
                {submitting ? "Reassigning…" : `Reassign to ${toOffice}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
