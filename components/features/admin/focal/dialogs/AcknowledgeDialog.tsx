"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { FocalIntakeDetail } from "@/lib/types/admin-focal-intake";

// Real production Acknowledge action — a municipal monitoring event, never
// a ticket status change (see CLAUDE.md's Severity/Urgency/Priority note
// and the report_acknowledgments docblock in api/src/db/schema.ts). After a
// successful submit this calls router.refresh() rather than updating any
// local optimistic state, so the UI always reflects server truth.
export function AcknowledgeDialog({
  report,
  open,
  onOpenChange,
}: {
  report: FocalIntakeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetAndClose() {
    setRemarks("");
    setError("");
    setSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/intake/${report.reportId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: remarks.trim() || undefined }),
    });
    if (res.ok) {
      resetAndClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? "Could not acknowledge this report.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acknowledge Report</DialogTitle>
          <DialogDescription>
            Confirms Central Monitoring has seen this report. This is a municipal monitoring action — it does not change the ticket&apos;s status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{report.reportReference} &middot; {report.category}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{report.barangayName}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ack-remarks">Remarks (optional)</label>
            <Textarea
              id="ack-remarks"
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any context worth noting for the record"
              rows={3}
              value={remarks}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={resetAndClose} variant="outline">Cancel</Button>
          <Button disabled={submitting} onClick={handleSubmit}>{submitting ? "Acknowledging…" : "Acknowledge Report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
