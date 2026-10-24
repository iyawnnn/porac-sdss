"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RelatedTicketCandidate, RelatedTicketCandidates } from "@/lib/types/admin-related-tickets";
import { MergeTicketsDialog } from "./MergeTicketsDialog";

// "Merge…" on one suggested related ticket (manuscript revision Phase 3,
// step 3d). Disabled, with the server's reason as a tooltip, when neither
// ticket can survive the merge; otherwise the dialog lets staff pick which
// one continues.
export function MergeCandidateButton({
  viewed,
  candidate,
}: {
  viewed: RelatedTicketCandidates["viewed"];
  candidate: RelatedTicketCandidate;
}) {
  const [open, setOpen] = useState(false);
  const { mergeIntoViewed, mergeViewedInto } = candidate.blockedReasons;

  if (mergeIntoViewed !== null && mergeViewedInto !== null) {
    const reasons = [...new Set([mergeIntoViewed, mergeViewedInto])].join(" ");
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events, so the span carries the tooltip. */}
          <span aria-label={`Merge unavailable: ${reasons}`} className="inline-flex" tabIndex={0}>
            <Button className="pointer-events-none" disabled size="xs" variant="outline">
              Merge…
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{reasons}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="xs" variant="outline">
        Merge…
      </Button>
      <MergeTicketsDialog candidate={candidate} onOpenChange={setOpen} open={open} viewed={viewed} />
    </>
  );
}
