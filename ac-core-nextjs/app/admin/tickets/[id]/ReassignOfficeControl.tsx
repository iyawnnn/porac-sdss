"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ReassignOfficeControl({
  ticketId,
  currentOffice,
}: {
  ticketId: number;
  currentOffice: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(currentOffice);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleReassign() {
    if (target === currentOffice) return;
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toOffice: target }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Reassign failed");
    }
    setSubmitting(false);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="reassign-office" className="text-ink-700">
        Reassign to:
      </label>
      <select
        id="reassign-office"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded-md border border-line-200 bg-surface px-2 py-1 text-sm text-ink-700"
      >
        <option value="CEO">CEO</option>
        <option value="ACDRRMO">ACDRRMO</option>
      </select>
      <button
        onClick={handleReassign}
        disabled={submitting || target === currentOffice}
        className="rounded-md border border-line-200 px-3 py-1 text-sm text-ink-700 hover:bg-canvas disabled:opacity-50"
      >
        {submitting ? "Reassigning..." : "Reassign"}
      </button>
      {error && <span className="text-urgency-critical-ink">{error}</span>}
    </div>
  );
}
