"use client";

import Link from "next/link";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import type { DashboardKpis, BarangayRiskRow, CategoryDistributionRow } from "@/lib/types/admin-dashboard";
import { priorityBandClass } from "@/lib/utils/ui/priority";
import { relativeAge } from "@/lib/utils/ui/time";
import DashboardMiniMapLoader from "./DashboardMiniMapLoader";

const GLASS_CARD = "rounded-xl border border-slate-200/60 bg-white/90 backdrop-blur-md shadow-sm p-5";
const FLAT_CARD = "rounded-xl border border-line-200 bg-surface p-5 shadow-sm";

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(Number(value))) return "—";
  const hours = Number(value);
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

// PAGASA rainfall-intensity bands — same 30mm/h torrential cap already
// documented against lib/triage/urgency.ts's precipitationFactor.
function rainLabel(rain1hMm: number): string {
  if (rain1hMm <= 0) return "No rain";
  if (rain1hMm < 2.5) return "Light";
  if (rain1hMm < 7.5) return "Moderate";
  if (rain1hMm < 15) return "Heavy";
  if (rain1hMm < 30) return "Intense";
  return "Torrential";
}

function toCsvRow(cells: (string | number)[]): string {
  return cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",");
}

function downloadCsv(filename: string, rows: string[]) {
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DashboardClient({
  kpis,
  leaderboard,
  categories,
  criticalQueue,
  rain1hMm,
}: {
  kpis: DashboardKpis;
  leaderboard: BarangayRiskRow[];
  categories: CategoryDistributionRow[];
  criticalQueue: AdminTicketRow[];
  rain1hMm: number;
}) {
  const topBarangay = leaderboard[0] ?? null;
  const maxBarangayCount = Math.max(1, ...leaderboard.map((b) => b.active_count));
  const maxCategoryCount = Math.max(1, ...categories.map((c) => c.active_count));

  function exportSummary() {
    const rows = [
      "Section,Metric,Value",
      toCsvRow(["KPI", "Active tickets", kpis.active_count]),
      toCsvRow(["KPI", "Critical priority (>=70)", kpis.critical_count]),
      toCsvRow(["KPI", "Avg resolution time (30d, hours)", kpis.avg_resolution_hours_30d?.toFixed(2) ?? ""]),
      toCsvRow(["KPI", "Resolved in last 24h", kpis.resolved_24h_count]),
      toCsvRow(["KPI", "Current rain rate (mm/h)", rain1hMm]),
      "",
      "Barangay,Active tickets,Avg priority",
      ...leaderboard.map((b) => toCsvRow([b.barangay_name, b.active_count, b.avg_priority?.toFixed(1) ?? ""])),
      "",
      "Category,Active tickets",
      ...categories.map((c) => toCsvRow([c.category, c.active_count])),
      "",
      "Ticket ID,Category,Barangay,Priority,Status",
      ...criticalQueue.map((t) => toCsvRow([t.id, t.category, t.barangay_name, t.priority_index ?? "", t.status])),
    ];
    downloadCsv(`executive-summary-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <header>
        <p className="text-sm font-medium text-brand-600">Incident command</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">Operations dashboard</h1>
        <p className="mt-2 text-sm text-ink-500">
          Live spatial risk, triage load, and environmental telemetry across Porac.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Active high urgency queue</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-rose-600">{kpis.critical_count}</p>
          <p className="mt-1 text-xs text-ink-500">of {kpis.active_count} active tickets citywide</p>
        </div>
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Primary hotspot barangay</p>
          <p className="mt-1.5 truncate text-xl font-semibold text-ink-900">{topBarangay?.barangay_name ?? "—"}</p>
          <p className="mt-1 text-xs text-ink-500">{topBarangay?.active_count ?? 0} active ticket(s)</p>
        </div>
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">24h resolution velocity</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-600">
            {kpis.resolved_24h_count}
          </p>
          <p className="mt-1 text-xs text-ink-500">closed today · {formatHours(kpis.avg_resolution_hours_30d)} avg (30d)</p>
        </div>
        <div className={GLASS_CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Environmental risk telemetry</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-indigo-600">{rain1hMm}mm/h</p>
          <p className="mt-1 text-xs text-ink-500">{rainLabel(rain1hMm)} rainfall right now</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-4">
          <div className={FLAT_CARD}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-ink-900">Spatial incident density</h2>
                <p className="mt-1 text-sm text-ink-500">Priority-weighted heat map of active tickets</p>
              </div>
              <Link
                href="/admin/map"
                className="shrink-0 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                Open full screen map
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-line-100">
              <DashboardMiniMapLoader />
            </div>
          </div>

          <div className={FLAT_CARD}>
            <h2 className="font-semibold text-ink-900">Barangay spatial risk leaderboard</h2>
            <p className="mt-1 text-sm text-ink-500">Top 5 barangays by active ticket count and average priority</p>
            <div className="mt-4 space-y-3">
              {leaderboard.map((b, i) => (
                <Link
                  key={b.barangay_id}
                  href={`/admin/tickets?barangayId=${b.barangay_id}&status=active`}
                  className="block rounded-lg border border-line-100 p-3 hover:bg-canvas"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink-900">
                      {i + 1}. {b.barangay_name}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${priorityBandClass(b.avg_priority)}`}>
                      avg {b.avg_priority?.toFixed(0) ?? "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(b.active_count / maxBarangayCount) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums text-ink-500">{b.active_count}</span>
                  </div>
                </Link>
              ))}
              {leaderboard.length === 0 && <p className="text-sm text-ink-500">No active tickets right now.</p>}
            </div>
          </div>

          <div className={FLAT_CARD}>
            <h2 className="font-semibold text-ink-900">Category workload distribution</h2>
            <p className="mt-1 text-sm text-ink-500">Active tickets by hazard category</p>
            <div className="mt-4 space-y-2.5">
              {categories.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{c.category}</span>
                    <span className="font-mono tabular-nums text-ink-500">{c.active_count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(c.active_count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-ink-500">No active tickets right now.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className={FLAT_CARD}>
            <h2 className="font-semibold text-ink-900">Critical attention queue</h2>
            <p className="mt-1 text-sm text-ink-500">Top 5 active tickets by priority</p>
            <div className="mt-4 space-y-2">
              {criticalQueue.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line-100 p-3 hover:bg-canvas"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      #{ticket.id} · {ticket.category}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {ticket.barangay_name} · {relativeAge(ticket.created_at, ticket.status)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${priorityBandClass(ticket.priority_index)}`}
                  >
                    {ticket.priority_index ?? "—"}
                  </span>
                </Link>
              ))}
              {criticalQueue.length === 0 && <p className="text-sm text-ink-500">No active tickets right now.</p>}
            </div>
          </div>

          <div className={FLAT_CARD}>
            <h2 className="font-semibold text-ink-900">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <Link
                href="/admin/flagged"
                className="block rounded-md border border-line-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-canvas"
              >
                Review flagged reports
              </Link>
              <Link
                href="/admin/tickets"
                className="block rounded-md border border-line-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-canvas"
              >
                View ticket queue
              </Link>
              <button
                type="button"
                onClick={exportSummary}
                className="block w-full rounded-md bg-brand-500 px-3 py-2 text-left text-sm font-medium text-white hover:bg-brand-600"
              >
                Export executive summary (CSV)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
