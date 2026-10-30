"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "Refresh" for the rainfall context (manuscript revision Phase 4, step 4c).
// The API allows one per ticket per 60 s and answers 429 with the wait; the
// call itself takes at most 5 s. On success the page re-reads the ticket.
export function RainfallRefreshButton({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRefresh() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/admin/tickets/${ticketId}/rainfall-context/refresh`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.message ?? data?.error ?? "Refresh failed. Try again in a minute.");
    }
    setSubmitting(false);
  }

  return (
    <div className="mt-2 space-y-1">
      <Button disabled={submitting} onClick={handleRefresh} size="sm" variant="outline">
        {submitting ? "Refreshing…" : "Refresh"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
