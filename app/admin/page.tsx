import Link from "next/link";
import { Suspense } from "react";
import {
  getDepartmentWorkload,
  getHighFrequencyLocations,
  getResponseTimeMetrics,
} from "@/lib/admin/dashboard";

const CARD_CLASS = "rounded-xl border border-line-200 bg-surface p-5 shadow-sm";

function formatHours(value: number | null) {
  if (value === null || !Number.isFinite(Number(value))) return "—";
  const hours = Number(value);
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

function WidgetSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section className={`${CARD_CLASS} animate-pulse`} aria-label="Loading dashboard metric">
      <div className="h-5 w-52 rounded bg-line-200" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, index) => <div key={index} className="h-8 rounded bg-line-100" />)}
      </div>
    </section>
  );
}

async function HighFrequencyLocations() {
  const locations = await getHighFrequencyLocations();
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-semibold text-ink-900">High-frequency locations</h2><p className="mt-1 text-sm text-ink-500">Mapped active incidents by barangay</p></div>
        <Link href="/admin/map" className="shrink-0 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">Open map</Link>
      </div>
      <div className="mt-5 space-y-3">
        {locations.map((location) => <div key={location.barangay_name} className="flex items-center justify-between gap-4 border-b border-line-100 pb-3 last:border-0 last:pb-0"><span className="text-sm font-medium text-ink-700">{location.barangay_name}</span><span className="font-mono text-sm tabular-nums text-ink-900">{location.active_incidents} active</span></div>)}
        {locations.length === 0 && <p className="text-sm text-ink-500">No active mapped incidents.</p>}
      </div>
    </section>
  );
}

async function ResponseTimeMetrics() {
  const metrics = await getResponseTimeMetrics();
  return (
    <section className={CARD_CLASS}>
      <h2 className="font-semibold text-ink-900">Response time metrics</h2>
      <p className="mt-1 text-sm text-ink-500">Average time from report to first response and resolution</p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm"><thead className="border-b border-line-200 text-xs uppercase tracking-wide text-ink-500"><tr><th className="pb-2 font-medium">Barangay</th><th className="pb-2 text-right font-medium">Response</th><th className="pb-2 text-right font-medium">Resolution</th></tr></thead><tbody>
          {metrics.map((metric) => <tr key={metric.barangay_name} className="border-b border-line-100 last:border-0"><td className="py-2.5 font-medium text-ink-700">{metric.barangay_name}</td><td className="py-2.5 text-right font-mono tabular-nums text-ink-700">{formatHours(metric.average_response_hours)}</td><td className="py-2.5 text-right font-mono tabular-nums text-ink-700">{formatHours(metric.average_resolution_hours)}</td></tr>)}
        </tbody></table>
        {metrics.length === 0 && <p className="py-3 text-sm text-ink-500">No response-time history is available yet.</p>}
      </div>
    </section>
  );
}

async function DepartmentWorkload() {
  const workload = await getDepartmentWorkload();
  return (
    <section className={CARD_CLASS}>
      <h2 className="font-semibold text-ink-900">Department workload</h2><p className="mt-1 text-sm text-ink-500">Current queue compared with completed tickets</p>
      <div className="mt-5 space-y-4">
        {workload.map((department) => {
          const total = department.active_tickets + department.resolved_tickets;
          const activePercent = total ? (department.active_tickets / total) * 100 : 0;
          return <div key={department.office}><div className="flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-ink-700">{department.office}</span><span className="font-mono tabular-nums text-ink-500">{department.active_tickets} active · {department.resolved_tickets} resolved</span></div><div className="mt-2 flex h-2 overflow-hidden rounded-full bg-status-resolved-tint" aria-label={`${department.office}: ${department.active_tickets} active and ${department.resolved_tickets} resolved`}><span className="bg-brand-500" style={{ width: `${activePercent}%` }} /></div></div>;
        })}
        {workload.length === 0 && <p className="text-sm text-ink-500">No departmental tickets yet.</p>}
      </div>
      <div className="mt-5 flex gap-4 text-xs text-ink-500"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Active</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-resolved-dot" /> Resolved</span></div>
    </section>
  );
}

export default function AdminDashboardPage() {
  return <div className="max-w-7xl mx-auto p-6"><header className="mb-6"><p className="text-sm font-medium text-brand-600">Incident analytics</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">Operations dashboard</h1><p className="mt-2 text-sm text-ink-500">Monitor incident concentration, service speed, and department capacity across Porac.</p></header><div className="grid gap-5 lg:grid-cols-2"><Suspense fallback={<WidgetSkeleton />}><HighFrequencyLocations /></Suspense><Suspense fallback={<WidgetSkeleton rows={5} />}><DepartmentWorkload /></Suspense><div className="lg:col-span-2"><Suspense fallback={<WidgetSkeleton rows={6} />}><ResponseTimeMetrics /></Suspense></div></div></div>;
}
