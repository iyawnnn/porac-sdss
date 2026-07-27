import { notFound } from "next/navigation";
import Link from "next/link";
import { getTicketDetail } from "@/lib/admin/tickets";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";
import AdvanceStatusButton from "./AdvanceStatusButton";
import ReassignOfficeControl from "./ReassignOfficeControl";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};

// Decomposition bar segments (DESIGN.md §5.5). Each segment occupies an
// equal third of the track; the fill *within* that third is the factor's
// own 0-1 value, so filled area = (1/3) * factor = the factor's actual
// contribution to urgency_score. Brand ramp, not the urgency ramp — this
// bar answers "where did the score come from", not "how severe is it".
const DECOMPOSITION_SEGMENTS = [
  { key: "E", sub: "elevation", field: "elevation_factor" as const, barClass: "bg-brand-300" },
  { key: "P", sub: "rainfall", field: "precipitation_factor" as const, barClass: "bg-brand-500" },
  { key: "C", sub: "cluster", field: "cluster_factor" as const, barClass: "bg-brand-700" },
];

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTicketDetail(Number(id));

  if (!data) notFound();

  const { ticket, reports, history, reassignments } = data;
  const nextStatus = NEXT_STATUS[ticket.status];
  const bandStyle = getUrgencyBandStyle(ticket.urgency_band);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/admin/tickets" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
        ← Back to queue
      </Link>

      <h1 className="text-xl font-semibold text-ink-900 mt-2 mb-4">
        Ticket #{ticket.id} — {ticket.category}
      </h1>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm border border-line-200 bg-surface rounded-lg p-4">
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Barangay</p>
          <p className="text-ink-900">{ticket.barangay_name}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Office</p>
          <p className="text-ink-900">{ticket.assigned_office}</p>
          <div className="mt-1">
            <ReassignOfficeControl ticketId={ticket.id} currentOffice={ticket.assigned_office} />
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Status</p>
          <p className="text-ink-900">{ticket.status}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide font-medium text-ink-500">Members</p>
          <p className="font-mono tabular-nums text-ink-900">{ticket.member_count}</p>
        </div>
      </div>

      {/* Computed system urgency, kept visually separate from each citizen's
          own severity rating below — PLAN.md §5 / DESIGN.md §5.4. Score
          breakdown per PLAN.md §7: Urgency = (1/3 × Elevation) +
          (1/3 × Precipitation) + (1/3 × Cluster) — DESIGN.md §5.5's
          decomposition bar visualizes this before the exact-number table. */}
      <div className="border border-line-200 bg-surface rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-ink-900 mb-3">System Urgency (computed)</h2>

        <div className="flex items-baseline gap-3 mb-4">
          <p className="font-mono text-3xl font-medium tabular-nums text-ink-900">
            {ticket.urgency_score?.toFixed(3) ?? "—"}
          </p>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${bandStyle.className}`}>
            {ticket.urgency_band ?? "—"}
          </span>
        </div>

        <div className="flex gap-0.5 h-2 w-full mb-1.5">
          {DECOMPOSITION_SEGMENTS.map((seg) => {
            const value = ticket[seg.field];
            const fillPct = value != null ? clamp01(value) * 100 : 0;
            return (
              <div key={seg.key} className="flex-1 h-full rounded-full bg-line-100 overflow-hidden">
                <div className={`h-full rounded-full ${seg.barClass}`} style={{ width: `${fillPct}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex gap-0.5 text-center mb-4">
          {DECOMPOSITION_SEGMENTS.map((seg) => {
            const value = ticket[seg.field];
            return (
              <div key={seg.key} className="flex-1">
                <p className="font-mono text-xs tabular-nums text-ink-700">
                  {seg.key} {value?.toFixed(3) ?? "—"}
                </p>
                <p className="text-[11px] text-ink-400">{seg.sub}</p>
              </div>
            );
          })}
        </div>

        <table className="w-full text-xs text-ink-700 border-collapse">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="font-normal pb-1">Factor</th>
              <th className="font-normal pb-1 text-right">Value</th>
              <th className="font-normal pb-1 text-right">Weight</th>
              <th className="font-normal pb-1 text-right">Contribution</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr>
              <td className="py-0.5">Elevation Factor</td>
              <td className="text-right">{ticket.elevation_factor?.toFixed(3) ?? "—"}</td>
              <td className="text-right">× 1/3</td>
              <td className="text-right">
                {ticket.elevation_factor != null ? (ticket.elevation_factor / 3).toFixed(3) : "—"}
              </td>
            </tr>
            <tr>
              <td className="py-0.5">Precipitation Factor</td>
              <td className="text-right">{ticket.precipitation_factor?.toFixed(3) ?? "—"}</td>
              <td className="text-right">× 1/3</td>
              <td className="text-right">
                {ticket.precipitation_factor != null ? (ticket.precipitation_factor / 3).toFixed(3) : "—"}
              </td>
            </tr>
            <tr>
              <td className="py-0.5">Cluster Factor</td>
              <td className="text-right">{ticket.cluster_factor?.toFixed(3) ?? "—"}</td>
              <td className="text-right">× 1/3</td>
              <td className="text-right">
                {ticket.cluster_factor != null ? (ticket.cluster_factor / 3).toFixed(3) : "—"}
              </td>
            </tr>
            <tr className="border-t border-line-200">
              <td className="py-1 font-sans font-medium text-ink-900" colSpan={3}>
                Urgency Score
              </td>
              <td className="text-right py-1 font-medium text-ink-900">
                {ticket.urgency_score?.toFixed(3) ?? "—"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-ink-500 mt-2">Elevation: {ticket.elevation_m ?? "—"} m</p>
      </div>

      {nextStatus && (
        <div className="mb-6">
          <AdvanceStatusButton ticketId={ticket.id} nextStatus={nextStatus} />
        </div>
      )}

      <h2 className="text-sm font-semibold text-ink-900 mb-2">Status History</h2>
      <ul className="text-sm text-ink-700 mb-6 space-y-1">
        {history.map((h, i) => (
          <li key={i}>
            {new Date(h.changed_at).toLocaleString()} — {h.status}
            {h.admin_name ? ` (${h.admin_name})` : ""}
          </li>
        ))}
        {history.length === 0 && <li className="text-ink-400">No status changes yet.</li>}
      </ul>

      <h2 className="text-sm font-semibold text-ink-900 mb-2">Office Reassignments</h2>
      <ul className="text-sm text-ink-700 mb-6 space-y-1">
        {reassignments.map((r, i) => (
          <li key={i}>
            {new Date(r.reassigned_at).toLocaleString()} — {r.from_office} → {r.to_office}
            {r.admin_name ? ` (${r.admin_name})` : ""}
          </li>
        ))}
        {reassignments.length === 0 && <li className="text-ink-400">No reassignments yet.</li>}
      </ul>

      <h2 className="text-sm font-semibold text-ink-900 mb-2">Member Reports ({reports.length})</h2>
      <div className="space-y-4">
        {reports.map((r) => (
          <div key={r.id} className="border border-line-200 bg-surface rounded-lg p-4 flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image_url} alt={r.title} className="w-32 h-32 object-cover rounded-md" />
            <div>
              <h3 className="font-medium text-ink-900">{r.title}</h3>
              {r.description && <p className="text-sm text-ink-500">{r.description}</p>}
              {/* Severity display rule (DESIGN.md §5.4) — deliberately
                  uncolored/typographic, never a badge, so it can never be
                  mistaken for the computed urgency_band badge above. This
                  is subjective citizen input; urgency is computed output. */}
              <p className="text-xs uppercase tracking-wide font-medium text-ink-500 mt-1">
                Reported as · {r.citizen_severity}
              </p>
              <p className="text-xs font-mono text-ink-400 mt-1">
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
