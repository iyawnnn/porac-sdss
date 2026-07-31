"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ModerationQueueRow, ModerationStats, ModerationAction } from "@/lib/types/admin-moderation";
import type { FlagCategoryKey } from "@/lib/utils/flag-risk";
import { getFlagCategory, computeRiskScore } from "@/lib/utils/flag-risk";
import { KpiBar } from "./KpiBar";
import { FlagBadge } from "./FlagBadge";
import { RiskMeter } from "./RiskMeter";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { flagEvidence, flagLabel } from "./flagText";

const CATEGORY_FILTERS: { key: FlagCategoryKey | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "duplicate", label: "Duplicate" },
  { key: "location", label: "Location" },
  { key: "authenticity", label: "Authenticity" },
];

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

interface PendingAction {
  reportId: number;
  action: ModerationAction;
}

export function FlaggedWorkspace({
  initialQueue,
  initialStats,
}: {
  initialQueue: ModerationQueueRow[];
  initialStats: ModerationStats;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [stats, setStats] = useState(initialStats);
  const [selectedId, setSelectedId] = useState<number | null>(initialQueue[0]?.id ?? null);
  const [categoryFilter, setCategoryFilter] = useState<FlagCategoryKey | "all">("all");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [duplicateId, setDuplicateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const filteredQueue = useMemo(() => {
    if (categoryFilter === "all") return queue;
    return queue.filter((r) => r.flags.some((f) => getFlagCategory(f).key === categoryFilter));
  }, [queue, categoryFilter]);

  const selected = queue.find((r) => r.id === selectedId) ?? filteredQueue[0] ?? null;

  function pushToast(message: string, tone: Toast["tone"]) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  function startAction(reportId: number, action: ModerationAction) {
    setPending({ reportId, action });
    setDuplicateId("");
  }

  async function confirmAction() {
    if (!pending) return;
    if (pending.action === "duplicate" && !duplicateId.trim()) {
      pushToast("Enter the canonical report ID first.", "error");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/admin/reports/${pending.reportId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: pending.action,
        canonicalReportId: pending.action === "duplicate" ? Number(duplicateId) : undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      pushToast(data.error ?? "Action failed.", "error");
      return;
    }

    setQueue((prev) => prev.filter((r) => r.id !== pending.reportId));
    setStats((prev) => ({
      ...prev,
      pending: Math.max(0, prev.pending - 1),
      quarantined: pending.action === "quarantine" ? prev.quarantined + 1 : prev.quarantined,
      dismissed: pending.action !== "quarantine" ? prev.dismissed + 1 : prev.dismissed,
    }));
    setSelectedId((current) => (current === pending.reportId ? null : current));
    setPending(null);
    pushToast(
      pending.action === "dismiss"
        ? "Flag dismissed — report stays live."
        : pending.action === "quarantine"
          ? "Report quarantined and hidden from the public map."
          : `Marked as duplicate of report #${duplicateId}.`,
      "success"
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Flagged Reports</h1>
        <p className="mt-1 text-sm text-ink-500">
          Flags are a signal, not an auto-reject — every report below was still created. Review the
          evidence and choose an action.
        </p>
      </div>

      <KpiBar stats={stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setCategoryFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  categoryFilter === f.key
                    ? "bg-ink-900 text-white"
                    : "border border-line-200 text-ink-700 hover:bg-canvas"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {filteredQueue.map((r) => {
              const score = computeRiskScore(r.flags);
              const isSelected = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    isSelected ? "border-brand-500 bg-brand-50" : "border-line-200 bg-surface hover:bg-canvas"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-line-100 text-xs font-semibold text-ink-700">
                      {r.citizen_name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{r.title}</p>
                      <p className="truncate text-xs text-ink-500">{r.citizen_name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <FlagBadge flag={r.flags[0]} />
                        {r.flags.length > 1 && (
                          <span className="text-xs text-ink-400">+{r.flags.length - 1} more</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <RiskMeter score={score} />
                        <span className="whitespace-nowrap text-xs text-ink-400">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredQueue.length === 0 && (
              <p className="rounded-lg border border-dashed border-line-200 p-4 text-center text-sm text-ink-500">
                No flagged reports in this category.
              </p>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-4">
          {selected ? (
            <DetailPanel
              report={selected}
              pending={pending?.reportId === selected.id ? pending : null}
              duplicateId={duplicateId}
              onDuplicateIdChange={setDuplicateId}
              submitting={submitting}
              onStartAction={(action) => startAction(selected.id, action)}
              onCancel={() => setPending(null)}
              onConfirm={confirmAction}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-line-200 bg-surface p-10 text-center text-sm text-ink-500">
              No report selected. The queue is clear or nothing matches this filter.
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-[2000] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
              t.tone === "success" ? "bg-ink-900 text-white" : "bg-rose-600 text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  report,
  pending,
  duplicateId,
  onDuplicateIdChange,
  submitting,
  onStartAction,
  onCancel,
  onConfirm,
}: {
  report: ModerationQueueRow;
  pending: PendingAction | null;
  duplicateId: string;
  onDuplicateIdChange: (value: string) => void;
  submitting: boolean;
  onStartAction: (action: ModerationAction) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const score = computeRiskScore(report.flags);
  const trustRatio = report.citizen_report_count > 0
    ? Math.round((1 - report.citizen_flag_count / report.citizen_report_count) * 100)
    : 100;

  return (
    <div className="space-y-4 rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{report.title}</h2>
          <p className="text-sm text-ink-500">
            {report.category} · {report.barangay_name} ·{" "}
            <Link href={`/admin/tickets/${report.ticket_id}`} className="text-brand-600 underline">
              Ticket #{report.ticket_id}
            </Link>
          </p>
        </div>
        <RiskMeter score={score} size="lg" />
      </div>

      <ImageLightbox
        src={report.image_url}
        alt={`Evidence photo submitted for "${report.title}" in ${report.barangay_name}, flagged for review`}
      />

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Flag breakdown</p>
        <ul className="space-y-1.5">
          {report.flags.map((flag) => (
            <li key={flag} className="flex flex-wrap items-center gap-2 text-sm">
              <FlagBadge flag={flag} />
              <span className="text-ink-500">{flagEvidence(flag, report) || flagLabel(flag)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-canvas p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Reporter history</p>
        <p className="mt-1 text-sm text-ink-900">
          {report.citizen_name} · {report.citizen_report_count} report
          {report.citizen_report_count === 1 ? "" : "s"} submitted, {report.citizen_flag_count} flagged
        </p>
        <p className="text-xs text-ink-500">{trustRatio}% clean submission rate</p>
      </div>

      {pending ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          {pending.action === "duplicate" ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-ink-700" htmlFor="canonical-report-id">
                Canonical report ID this duplicates
              </label>
              <input
                id="canonical-report-id"
                type="number"
                value={duplicateId}
                onChange={(e) => onDuplicateIdChange(e.target.value)}
                className="w-full rounded-md border border-line-200 px-2 py-1.5 text-sm"
                placeholder="e.g. 42"
              />
            </div>
          ) : (
            <p className="text-sm text-ink-700">
              {pending.action === "dismiss"
                ? "Dismiss this flag? The report stays visible as-is."
                : "Quarantine this report? It will be hidden from the public map immediately."}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="rounded-md bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-700 disabled:opacity-50"
            >
              {submitting ? "Working..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-md border border-line-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onStartAction("dismiss")}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Dismiss flag
          </button>
          <button
            type="button"
            onClick={() => onStartAction("quarantine")}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
          >
            Quarantine report
          </button>
          <button
            type="button"
            onClick={() => onStartAction("duplicate")}
            className="rounded-md border border-line-200 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-canvas"
          >
            Mark as duplicate
          </button>
        </div>
      )}
    </div>
  );
}
