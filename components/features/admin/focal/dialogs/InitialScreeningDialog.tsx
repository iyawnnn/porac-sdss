"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FocalIntakeDetail, ScreeningRecommendation } from "@/lib/types/admin-focal-intake";

const HANDLING_LABEL: Record<ScreeningRecommendation, string> = {
  continue: "Continue with assigned office",
  forward: "Forward to another office",
  escalate: "Escalate for priority attention",
};

// Records only the recommendation — never executes Forward/Escalate itself
// (that stays the dedicated Forward/Escalate dialog's job). On submit,
// screening always saves first (report_intake_actions 'screened'); the
// PARENT decides what happens next based on the chosen recommendation —
// "continue" just closes this dialog, "forward"/"escalate" immediately
// opens the corresponding follow-up dialog. Canceling that follow-up dialog
// leaves the report Screened, per the approved behavior.
export function InitialScreeningDialog({
  report,
  open,
  onOpenChange,
  onScreened,
}: {
  report: FocalIntakeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScreened: (outcome: ScreeningRecommendation) => void;
}) {
  const [outcome, setOutcome] = useState<ScreeningRecommendation>("continue");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setOutcome("continue");
    setRemarks("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/intake/${report.reportId}/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: remarks.trim() || undefined, recommendedHandling: outcome }),
    });
    if (res.ok) {
      const submitted = outcome;
      setOutcome("continue");
      setRemarks("");
      setError("");
      setSubmitting(false);
      onOpenChange(false);
      onScreened(submitted);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not complete screening.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Initial Screening</DialogTitle>
          <DialogDescription>
            Records Central Monitoring&apos;s recommended handling for {report.reportReference}. Does not change the ticket&apos;s status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{report.reportReference} &middot; {report.category}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Currently routed to <span className="font-medium text-foreground">{report.routedOffice}</span></p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="screening-handling">Recommended Handling</label>
            <Select onValueChange={(v) => setOutcome(v as ScreeningRecommendation)} value={outcome}>
              <SelectTrigger className="w-full" id="screening-handling"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(HANDLING_LABEL) as ScreeningRecommendation[]).map((key) => (
                  <SelectItem key={key} value={key}>{HANDLING_LABEL[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="screening-remarks">Screening remarks</label>
            <Textarea
              id="screening-remarks"
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="What did screening find?"
              rows={3}
              value={remarks}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={resetAndClose} variant="outline">Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit}>{submitting ? "Saving…" : "Complete Screening"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
