"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FocalIntakeDetail } from "@/lib/types/admin-focal-intake";

const OFFICES: ("MEO" | "MDRRMO")[] = ["MEO", "MDRRMO"];

// Real Forward/Escalate actions. Forward posts to the server-authoritative
// endpoint, which re-validates ticket status/active-work-order state
// immediately before mutating (see FocalIntakeService.forward /
// TicketsService.reassignOffice) — a 403 here means the safety window
// closed between page load and submit, not something the client can
// pre-empt with disabled buttons alone.
export function ForwardEscalateDialog({
  mode,
  report,
  open,
  onOpenChange,
}: {
  mode: "forward" | "escalate";
  report: FocalIntakeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const otherOffice = OFFICES.find((o) => o !== report.routedOffice) ?? OFFICES[0];
  const [targetOffice, setTargetOffice] = useState<"MEO" | "MDRRMO">(otherOffice);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setTargetOffice(otherOffice);
    setReason("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!reason.trim()) {
      setError(mode === "forward" ? "A reason is required." : "An escalation reason is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const url = `/api/admin/intake/${report.reportId}/${mode}`;
    const body = mode === "forward" ? { toOffice: targetOffice, reason: reason.trim() } : { reason: reason.trim() };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      resetAndClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? (mode === "forward" ? "Could not forward this report." : "Could not escalate this report."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())} open={open}>
      <DialogContent className="sm:max-w-md">
        {mode === "forward" ? (
          <DialogHeader>
            <DialogTitle>Forward Report</DialogTitle>
            <DialogDescription>Reroutes {report.reportReference} to another office. Only allowed while the ticket is still Reported and no work order is active. Does not change the ticket&apos;s status.</DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle>Escalate Report</DialogTitle>
            <DialogDescription>Flags {report.reportReference} for priority attention. Does not change the ticket&apos;s status, office, or scores.</DialogDescription>
          </DialogHeader>
        )}

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{report.reportReference} &middot; {report.category}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{report.barangayName} &middot; Currently routed to <span className="font-medium text-foreground">{report.routedOffice}</span></p>
          </div>

          {mode === "forward" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="forward-target">Forward to</label>
              <Select onValueChange={(v) => setTargetOffice(v as "MEO" | "MDRRMO")} value={targetOffice}>
                <SelectTrigger className="w-full" id="forward-target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFFICES.filter((o) => o !== report.routedOffice).map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="forward-escalate-reason">
              {mode === "forward" ? "Reason" : "Escalation reason"}
            </label>
            <Textarea
              id="forward-escalate-reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "forward" ? "Why this report belongs with the other office" : "Why this report needs priority attention"}
              rows={3}
              value={reason}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={resetAndClose} variant="outline">Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit} variant={mode === "escalate" ? "destructive" : "default"}>
            {submitting ? "Saving…" : mode === "forward" ? "Forward Report" : "Escalate Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
