"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MyResolutionFeedback } from "@/lib/types/citizens-reports";

// The citizen's own one-time answer on a resolved ticket (manuscript revision
// Phase 3, step 3g). Only their own answer is ever shown: once given it is
// locked, and another reporter's answer on the same ticket never changes
// what this citizen sees or can do. The dispute reason stays with the
// office (it is not repeated here).

export default function ResolutionFeedback({
  reportId,
  myFeedback,
}: {
  reportId: number;
  myFeedback: MyResolutionFeedback | null;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The answer just given, or the one the server sent (also after the
  // refresh a 409 triggers).
  const [given, setGiven] = useState<MyResolutionFeedback | null>(null);
  const answer = given ?? myFeedback;
  const answeredOn = answer
    ? new Date(answer.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  if (answer?.feedback_type === "DISPUTED") {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-5" data-testid="resolution-feedback-locked">
        <h2 className="text-[16px] font-semibold text-ink-900">Resolution Feedback</h2>
        <p className="mt-2 text-[13px] leading-[18px] text-ink-500">
          You reported that this issue isn&apos;t actually fixed. The assigned office has been notified.
        </p>
        <p className="mt-1 text-[12px] text-ink-400">Answered {answeredOn}. Your answer can&apos;t be changed.</p>
      </div>
    );
  }

  if (answer?.feedback_type === "CONFIRMED") {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-5" data-testid="resolution-feedback-locked">
        <h2 className="text-[16px] font-semibold text-ink-900">Resolution Feedback</h2>
        <p className="mt-2 text-[13px] leading-[18px] text-status-resolved-ink">
          Thanks for confirming — glad this got fixed.
        </p>
        <p className="mt-1 text-[12px] text-ink-400">Answered {answeredOn}. Your answer can&apos;t be changed.</p>
      </div>
    );
  }

  // 409: this citizen already answered (another tab, say). The refresh
  // brings in their locked answer.
  async function handleResult(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setGiven(data.feedback);
      router.refresh();
    } else {
      setError(data.message ?? "Couldn't submit your feedback. Please try again.");
      if (res.status === 409) router.refresh();
    }
  }

  async function submitConfirm() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reports/mine/${reportId}/confirm-resolution`, {
      method: "POST",
    });
    await handleResult(res);
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
    await handleResult(res);
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
          {error && <p className="text-xs text-danger-ink">{error}</p>}
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

      {!showForm && error && <p className="mt-3 text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
