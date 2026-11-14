"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/utils/api-error-message";
import { reloadTicketDetail } from "./reloadTicketDetail";

const RETURN_REASON_MAX_LENGTH = 1000;

// Return to Under Review after a wrong referral (manuscript revision Phase 5,
// step 5c). Ticket Detail renders this only when the API says the ticket
// can return (Resolved by External referral, by this office); the API
// checks the same rule again. The reason is staff-only: no citizen
// notification or email is sent.
export function ReturnToReviewPanel({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/return-to-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: trimmed }),
    });

    if (res.ok) {
      setReason("");
      setSubmitting(false);
      reloadTicketDetail(router);
    } else {
      const data = await res.json().catch(() => null);
      setError(apiErrorMessage(data, "Could not return this ticket to Under Review."));
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        Use this when the external referral was wrong or the agency did not act. The ticket goes back to Under Review and its current outcome and
        resolution notes are cleared. The earlier referral and the earlier resolution stay in the timeline. The reason is for staff only; the
        citizen is not notified.
      </p>
      <Textarea
        aria-label="Reason for returning to Under Review"
        maxLength={RETURN_REASON_MAX_LENGTH}
        onChange={(e) => {
          setReason(e.target.value);
          setError("");
        }}
        placeholder="Why does this ticket need more work?"
        value={reason}
      />
      <Button disabled={submitting || !reason.trim()} onClick={handleSubmit} size="sm" variant="outline">
        {submitting ? "Returning..." : "Return to Under Review"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
