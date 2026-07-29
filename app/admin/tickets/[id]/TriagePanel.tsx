"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const GLASS_CARD = "bg-white/90 border border-slate-200/60 rounded-xl p-5 shadow-sm flex flex-col justify-between";
const CARD_HEADER = "text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3";

export function TriagePanel({
  ticketId,
  nextStatus,
  currentOffice,
}: {
  ticketId: number;
  nextStatus: string | undefined;
  currentOffice: string;
}) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);

  const [reassignTarget, setReassignTarget] = useState(currentOffice);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState("");

  async function advanceStatus() {
    setAdvancing(true);
    await fetch(`/api/admin/tickets/${ticketId}/status`, { method: "POST" });
    router.refresh();
    setAdvancing(false);
  }

  function handleAdvanceClick() {
    if (nextStatus === "Resolved") {
      setShowResolveModal(true);
      return;
    }
    void advanceStatus();
  }

  async function handleReassign() {
    if (reassignTarget === currentOffice) return;
    setReassigning(true);
    setReassignError("");

    const res = await fetch(`/api/admin/tickets/${ticketId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toOffice: reassignTarget }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setReassignError(data.error ?? "Reassign failed");
    }
    setReassigning(false);
  }

  return (
    <div className={`${GLASS_CARD} space-y-5`}>
      <div>
        <p className={CARD_HEADER}>Action controls — status</p>
        {nextStatus ? (
          <button
            onClick={handleAdvanceClick}
            disabled={advancing}
            className="w-full rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {advancing ? "Updating..." : `Advance to "${nextStatus}"`}
          </button>
        ) : (
          <p className="text-sm text-ink-500">This ticket has no further status transition.</p>
        )}
      </div>

      <div className="border-t border-line-100 pt-4">
        <p className={CARD_HEADER}>Office</p>
        <div className="flex items-center gap-2">
          <select
            value={reassignTarget}
            onChange={(e) => setReassignTarget(e.target.value)}
            className="flex-1 rounded-md border border-line-200 bg-surface px-2 py-1.5 text-sm text-ink-700"
          >
            <option value="MEO">MEO</option>
            <option value="MDRRMO">MDRRMO</option>
          </select>
          <button
            onClick={handleReassign}
            disabled={reassigning || reassignTarget === currentOffice}
            className="rounded-md border border-line-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-canvas disabled:opacity-50"
          >
            {reassigning ? "Reassigning..." : "Reassign"}
          </button>
        </div>
        {reassignError && <p className="mt-1.5 text-xs text-urgency-critical-ink">{reassignError}</p>}
      </div>

      {showResolveModal && (
        <ResolveModal
          ticketId={ticketId}
          onClose={() => setShowResolveModal(false)}
          onResolved={() => {
            setShowResolveModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ResolveModal({
  ticketId,
  onClose,
  onResolved,
}: {
  ticketId: number;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    const formData = new FormData();
    if (file) formData.append("image", file);
    if (notes.trim()) formData.append("notes", notes.trim());

    const res = await fetch(`/api/admin/tickets/${ticketId}/status`, { method: "POST", body: formData });
    if (res.ok) {
      onResolved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Could not mark this ticket resolved.");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark ticket resolved"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-xl border border-line-200 bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-ink-900">Mark ticket resolved</h2>
          <p className="mt-1 text-sm text-ink-500">
            Optionally attach a proof-of-completion photo and notes for the record.
          </p>
        </div>

        <div>
          <label htmlFor="resolve-photo" className="mb-1.5 block text-xs font-medium text-ink-700">
            Resolution photo
          </label>
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="Preview of the selected resolution proof photo, not yet uploaded"
              className="mb-2 h-32 w-full rounded-md object-cover"
            />
          ) : (
            <div className="mb-2 flex h-32 w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
              No photo selected
            </div>
          )}
          <input id="resolve-photo" type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
        </div>

        <div>
          <label htmlFor="resolve-notes" className="mb-1.5 block text-xs font-medium text-ink-700">
            Completion notes
          </label>
          <textarea
            id="resolve-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What was done to resolve this?"
            className="w-full rounded-md border border-line-200 px-2.5 py-1.5 text-sm text-ink-700"
          />
        </div>

        {error && <p className="text-sm text-urgency-critical-ink">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-line-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-canvas"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? "Resolving..." : "Mark resolved"}
          </button>
        </div>
      </div>
    </div>
  );
}
