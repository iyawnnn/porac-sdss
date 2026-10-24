"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { MergeTicketsResult, RelatedTicketCandidate, RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";
import { postGrouping } from "./postGrouping";

const REASON_MAX_LENGTH = 1000;

// Staff Merge (manuscript revision Phase 3, step 3d; handoff Decision 1):
// one ticket survives and keeps its location, status and Work Orders; the
// other's reports move to it and it stays as read-only history. The survivor
// defaults to the older ticket and staff can swap it. A direction the server
// would refuse is shown disabled with the server's reason.
export function MergeTicketsDialog({
  open,
  onOpenChange,
  viewed,
  candidate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewed: RelatedTicketCandidates["viewed"];
  candidate: RelatedTicketCandidate;
}) {
  const router = useRouter();
  const options = [
    {
      key: "viewed" as const,
      survivorId: viewed.ticketId,
      survivorCreatedAt: viewed.createdAt,
      mergedId: candidate.ticketId,
      movedCount: candidate.memberCount,
      blocked: candidate.blockedReasons.mergeIntoViewed,
    },
    {
      key: "candidate" as const,
      survivorId: candidate.ticketId,
      survivorCreatedAt: candidate.createdAt,
      mergedId: viewed.ticketId,
      movedCount: viewed.reportCount,
      blocked: candidate.blockedReasons.mergeViewedInto,
    },
  ];
  // Older by creation time, then by id.
  const older = [...options].sort(
    (a, b) => new Date(a.survivorCreatedAt).getTime() - new Date(b.survivorCreatedAt).getTime() || a.survivorId - b.survivorId,
  )[0].key;
  const [choice, setChoice] = useState<"viewed" | "candidate">(older);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const selected = options.find((option) => option.key === choice)!;

  function close() {
    setReason("");
    setError("");
    setSubmitting(false);
    setChoice(older);
    onOpenChange(false);
  }

  async function confirm() {
    setSubmitting(true);
    setError("");
    const result = await postGrouping<MergeTicketsResult>("merge", {
      survivorTicketId: selected.survivorId,
      mergedTicketId: selected.mergedId,
      reason,
    });
    if (result.ok) {
      close();
      router.refresh();
    } else {
      setError(result.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Merge Ticket #{viewed.ticketId} and Ticket #{candidate.ticketId}
          </DialogTitle>
          <DialogDescription>
            Choose the ticket that continues. The other ticket&apos;s reports move to it, and the other ticket stays as
            read-only history linked to it.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Keep</legend>
          {options.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary"
              key={option.key}
            >
              <input
                checked={choice === option.key}
                className="mt-0.5"
                name="merge-survivor"
                onChange={() => setChoice(option.key)}
                type="radio"
              />
              <span className="min-w-0">
                <span className="block font-medium">
                  Keep Ticket #{option.survivorId}
                  {option.key === older ? " (older)" : ""}
                </span>
                {option.blocked && <span className="mt-0.5 block text-xs text-destructive">{option.blocked}</span>}
              </span>
            </label>
          ))}
        </fieldset>

        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          {selected.movedCount} {selected.movedCount === 1 ? "report moves" : "reports move"} from Ticket #{selected.mergedId} to Ticket #
          {selected.survivorId}. Ticket #{selected.survivorId} keeps its location, status and Work Orders; Ticket #
          {selected.mergedId} keeps its own history and becomes read-only.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="merge-reason">
            Reason (required)
          </label>
          <Textarea
            id="merge-reason"
            maxLength={REASON_MAX_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why these reports are the same incident"
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
          <Button disabled={submitting || selected.blocked !== null || reason.trim().length === 0} onClick={confirm}>
            {submitting ? "Merging…" : "Confirm merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
