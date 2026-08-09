"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResolutionFeedback({
  reportId,
  disputedAt,
  resolutionConfirmedAt,
}: {
  reportId: number;
  disputedAt: string | null;
  resolutionConfirmedAt: string | null;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disputed, setDisputed] = useState(!!disputedAt);
  const [confirmed, setConfirmed] = useState(!!resolutionConfirmedAt);

  if (disputed) {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <h2 className="text-[16px] font-semibold text-ink-900">Resolution Feedback</h2>
        <p className="mt-2 text-[13px] leading-[18px] text-ink-500">
          You reported that this issue isn&apos;t actually fixed. The assigned office has been notified.
        </p>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-5">
        <h2 className="text-[16px] font-semibold text-ink-900">Resolution Feedback</h2>
        <p className="mt-2 text-[13px] leading-[18px] text-status-resolved-ink">
          Thanks for confirming — glad this got fixed.
        </p>
      </div>
    );
  }

  async function submitConfirm() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reports/mine/${reportId}/confirm-resolution`, {
      method: "POST",
    });
    if (res.ok) {
      setConfirmed(true);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Couldn't submit your feedback. Please try again.");
    }
    setBusy(false);
  }

  async function submitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please enter a short reason.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reports/mine/${reportId}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      setDisputed(true);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Couldn't submit your feedback. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <h2 className="text-[16px] font-semibold text-ink-900">Resolution Feedback</h2>
      <p className="mt-1 text-[13px] text-ink-500">
        This issue was marked resolved. Is it actually fixed?
      </p>

      {!showForm ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submitConfirm}
            disabled={busy}
            className="h-9 rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Confirming…" : "Confirm Fixed"}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={busy}
            className="h-9 rounded-md border border-line-200 px-4 text-sm font-medium text-ink-700 hover:bg-line-100 disabled:opacity-60"
          >
            Report Still Not Fixed
          </button>
        </div>
      ) : (
        <form onSubmit={submitDispute} noValidate className="mt-4 space-y-3">
          <div>
            <label htmlFor="dispute-reason" className="mb-1 block text-[11px] font-medium uppercase tracking-[0.04em] text-ink-700">
              What&apos;s still wrong?
            </label>
            <textarea
              id="dispute-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900"
              placeholder="e.g. The pothole is still there"
            />
          </div>
          {error && <p className="text-xs text-urgency-critical-ink">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="h-9 rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              disabled={busy}
              className="h-9 rounded-md border border-line-200 px-4 text-sm font-medium text-ink-700 hover:bg-line-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!showForm && error && <p className="mt-3 text-xs text-urgency-critical-ink">{error}</p>}
    </div>
  );
}
