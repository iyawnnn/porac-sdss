"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReferDialog } from "@/components/features/admin/tickets/routing/ReferDialog";

// The manual Refer action (manuscript revision Phase 5, step 5a), shown for
// a referral/coordination category. blockedReason is the API's own refusal
// message, as for AssignmentPanel; hideWhenBlocked leaves the button out (a
// Rejected ticket).
export function ReferralPanel({
  ticketId,
  blockedReason,
  hideWhenBlocked = false,
}: {
  ticketId: number;
  blockedReason: string | null;
  hideWhenBlocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const blocked = blockedReason !== null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        This category is a referral/coordination concern, not this office&apos;s direct responsibility. Record who it was
        referred to, and why.
      </p>
      {!(blocked && hideWhenBlocked) && (
        <Button disabled={blocked} onClick={() => setOpen(true)} size="sm" variant="outline">
          Refer
        </Button>
      )}
      {blocked && (
        <p className="text-xs text-ink-500" data-testid="refer-blocked">
          {blockedReason}
        </p>
      )}
      {!blocked && <ReferDialog actionPath={`/api/admin/tickets/${ticketId}`} onOpenChange={setOpen} open={open} ticketId={ticketId} />}
    </div>
  );
}
