"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "Retry lookup" for a TEMPORARILY_UNAVAILABLE Hazard Information result
// (manuscript revision Phase 4, step 4b). The API allows one attempt per
// ticket per 60 s and answers 429 with the wait; the lookup itself takes at
// most 8 s. On success the page re-reads the ticket.
export function HazardRetryButton({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRetry() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/tickets/${ticketId}/hazard-information/retry`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? data?.error ?? "Retry failed. Try again in a minute.");
    }
    setSubmitting(false);
  }

  return (
    <div className="mt-2 space-y-1">
      <Button disabled={submitting} onClick={handleRetry} size="sm" variant="outline">
        {submitting ? "Checking…" : "Retry lookup"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
