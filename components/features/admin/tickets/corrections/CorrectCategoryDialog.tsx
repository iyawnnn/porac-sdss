"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryCorrectionResult, CorrectionAvailability } from "@/lib/types/admin-ticket-corrections";
import { postCorrection } from "./postCorrection";

const REASON_MAX_LENGTH = 1000;

// Staff category correction (manuscript pp. 42–45; manuscript revision Phase
// 3, step 3e). A category of the other office also moves the ticket there,
// recorded as a Reassign with this reason, and is refused while a Work Order
// is active. The citizen's own category stays on their report.
//
// afterMove: what happens once the ticket has moved to the other office.
// Operational Personnel lose access to it, so the dialog says so and offers
// the queue; Focal sees every office and simply refreshes.
export function CorrectCategoryDialog({
  open,
  onOpenChange,
  availability,
  afterMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availability: CorrectionAvailability;
  afterMove: "leave" | "refresh";
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [moved, setMoved] = useState<CategoryCorrectionResult | null>(null);

  const choices = availability.categories.filter((c) => c.category !== availability.category);
  const targetOffice = availability.categories.find((c) => c.category === category)?.office;
  const officeChanges = targetOffice !== undefined && targetOffice !== availability.assignedOffice;
  const blocked = officeChanges ? availability.officeChangeBlocked : null;

  function close() {
    setCategory("");
    setReason("");
    setError("");
    setSubmitting(false);
    setMoved(null);
    onOpenChange(false);
  }

  async function confirm() {
    setSubmitting(true);
    setError("");
    const result = await postCorrection<CategoryCorrectionResult>(availability.ticketId, "category", { category, reason });
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    if (result.data.officeChanged && afterMove === "leave") {
      setSubmitting(false);
      setMoved(result.data);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : moved ? router.push("/admin/tickets") : close())} open={open}>
      <DialogContent className="sm:max-w-lg">
        {moved ? (
          <>
            <DialogHeader>
              <DialogTitle>Ticket #{moved.ticketId} moved to {moved.assignedOffice}</DialogTitle>
              <DialogDescription>
                Its category is now {moved.category}, so it was reassigned to {moved.assignedOffice} with your reason. It now
                appears in {moved.assignedOffice}&apos;s queue, and you no longer have access to it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => router.push("/admin/tickets")}>Back to ticket queue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Correct the category of Ticket #{availability.ticketId}</DialogTitle>
              <DialogDescription>
                Now: {availability.category} ({availability.assignedOffice}). The citizen&apos;s report keeps the category they
                chose.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="correct-category">
                New category
              </label>
              <Select onValueChange={setCategory} value={category}>
                <SelectTrigger aria-label="New category" className="w-full" id="correct-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((c) => (
                    <SelectItem key={c.category} value={c.category}>
                      {c.category} · {c.office}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {officeChanges && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                {targetOffice} handles this category, so the ticket moves from {availability.assignedOffice} to {targetOffice}. A
                Reassign is recorded with your reason.
              </p>
            )}
            {blocked && (
              <p className="text-sm text-destructive" role="alert">
                {blocked}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="correct-category-reason">
                Reason (required)
              </label>
              <Textarea
                id="correct-category-reason"
                maxLength={REASON_MAX_LENGTH}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why the category is being corrected"
                rows={3}
                value={reason}
              />
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
              <Button disabled={submitting || !category || blocked !== null || reason.trim().length === 0} onClick={confirm}>
                {submitting ? "Saving…" : "Correct category"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
