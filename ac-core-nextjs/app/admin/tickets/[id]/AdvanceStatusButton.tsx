"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdvanceStatusButton({
  ticketId,
  nextStatus,
}: {
  ticketId: number;
  nextStatus: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await fetch(`/api/admin/tickets/${ticketId}/status`, { method: "POST" });
    router.refresh();
    setSubmitting(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
    >
      {submitting ? "Updating..." : `Advance to "${nextStatus}"`}
    </button>
  );
}
