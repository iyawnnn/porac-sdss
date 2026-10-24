"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CorrectionAvailability } from "@/lib/types/admin-ticket-corrections";
import { CorrectCategoryDialog } from "./CorrectCategoryDialog";
import { CorrectLocationDialog } from "./CorrectLocationDialog";

// "Correct category…" and "Correct location…" (manuscript revision Phase 3,
// step 3e) on Ticket Detail and Focal Intake Detail. When this viewer may
// not correct the ticket, both are disabled with the server's reason as a
// tooltip.
export function TicketCorrectionActions({
  availability,
  afterMove,
}: {
  availability: CorrectionAvailability;
  afterMove: "leave" | "refresh";
}) {
  const [dialog, setDialog] = useState<"category" | "location" | null>(null);
  const { blocked } = availability;

  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton blocked={blocked} label="Correct category…" onClick={() => setDialog("category")} />
      <ActionButton blocked={blocked} label="Correct location…" onClick={() => setDialog("location")} />
      {blocked === null && (
        <>
          <CorrectCategoryDialog
            afterMove={afterMove}
            availability={availability}
            onOpenChange={(open) => setDialog(open ? "category" : null)}
            open={dialog === "category"}
          />
          <CorrectLocationDialog
            availability={availability}
            onOpenChange={(open) => setDialog(open ? "location" : null)}
            open={dialog === "location"}
          />
        </>
      )}
    </div>
  );
}

function ActionButton({ label, blocked, onClick }: { label: string; blocked: string | null; onClick: () => void }) {
  if (blocked === null) {
    return (
      <Button onClick={onClick} size="sm" variant="outline">
        {label}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the span carries the tooltip. */}
        <span aria-label={`${label.replace("…", "")} unavailable: ${blocked}`} className="inline-flex" tabIndex={0}>
          <Button className="pointer-events-none" disabled size="sm" variant="outline">
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{blocked}</TooltipContent>
    </Tooltip>
  );
}
