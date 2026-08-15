"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function RejectTicketPanel({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A reason is required");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: trimmed }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Reject failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        Reject this ticket if it will not be acted on. The reason is sent to the citizen and cannot be undone.
      </p>
      <Textarea
        aria-label="Rejection reason"
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this report being rejected?"
        value={reason}
      />
      <Button disabled={submitting || !reason.trim()} onClick={handleSubmit} size="sm" variant="destructive">
        {submitting ? "Rejecting..." : "Reject Ticket"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
