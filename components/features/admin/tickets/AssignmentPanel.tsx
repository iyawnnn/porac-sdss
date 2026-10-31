"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReassignDialog } from "@/components/features/admin/tickets/routing/ReassignDialog";

// The responsible office and the manual Reassign action (manuscript
// revision Phase 5, step 5a). blockedReason is the API's own refusal message
// for this admin and ticket (GET /admin/tickets/:id routing.blockedReason):
// the button is disabled with that explanation, or left out entirely when
// hideWhenBlocked (a Rejected ticket).
export function AssignmentPanel({
  ticketId,
  currentOffice,
  blockedReason,
  hideWhenBlocked = false,
}: {
  ticketId: number;
  currentOffice: "MEO" | "MDRRMO";
  blockedReason: string | null;
  hideWhenBlocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const blocked = blockedReason !== null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-700">
          Responsible office: <span className="font-medium text-ink-900">{currentOffice}</span>
        </p>
        {!(blocked && hideWhenBlocked) && (
          <Button disabled={blocked} onClick={() => setOpen(true)} size="sm" variant="outline">
            Reassign
          </Button>
        )}
      </div>
      {blocked && (
        <p className="text-xs text-ink-500" data-testid="reassign-blocked">
          {blockedReason}
        </p>
      )}
      {!blocked && (
        <ReassignDialog
          actionPath={`/api/admin/tickets/${ticketId}`}
          afterMove="leave"
          currentOffice={currentOffice}
          onOpenChange={setOpen}
          open={open}
          ticketId={ticketId}
        />
      )}
    </div>
  );
}
