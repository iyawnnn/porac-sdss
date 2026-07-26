import { notFound } from "next/navigation";
import Link from "next/link";
import { getTicketDetail } from "@/lib/admin/tickets";
import AdvanceStatusButton from "./AdvanceStatusButton";
import ReassignOfficeControl from "./ReassignOfficeControl";

const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};

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

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/admin/tickets" className="text-blue-600 underline text-sm">
        ← Back to queue
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-4">
        Ticket #{ticket.id} — {ticket.category}
      </h1>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm border p-4 rounded">
        <div>
          <strong>Barangay:</strong> {ticket.barangay_name}
        </div>
        <div>
          <strong>Office:</strong> {ticket.assigned_office}
          <div className="mt-1">
            <ReassignOfficeControl ticketId={ticket.id} currentOffice={ticket.assigned_office} />
          </div>
        </div>
        <div>
          <strong>Status:</strong> {ticket.status}
        </div>
        <div>
          <strong>Members:</strong> {ticket.member_count}
        </div>
      </div>

      {/* Computed system urgency, kept visually separate from each citizen's
          own severity rating below — PLAN.md §5. Score breakdown per
          PLAN.md §7: Urgency = (1/3 × Elevation) + (1/3 × Precipitation) +
          (1/3 × Cluster), so the weight is shown per factor, not just the
          final number, per PLAN.md §13 Phase 5. */}
      <div className="border p-4 rounded mb-6 bg-gray-50">
        <h2 className="font-bold mb-2">System Urgency (computed)</h2>
        <p className="text-2xl font-mono mb-3">
          {ticket.urgency_score?.toFixed(3) ?? "—"}{" "}
          <span className="text-base">({ticket.urgency_band ?? "—"})</span>
        </p>
        <table className="w-full text-xs text-gray-700 border-collapse">
          <thead>
            <tr className="text-left text-gray-500">
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
            <tr className="border-t">
              <td className="py-1 font-sans font-medium text-gray-900" colSpan={3}>
                Urgency Score
              </td>
              <td className="text-right py-1 font-medium text-gray-900">
                {ticket.urgency_score?.toFixed(3) ?? "—"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-2">Elevation: {ticket.elevation_m ?? "—"} m</p>
      </div>

      {nextStatus && (
        <div className="mb-6">
          <AdvanceStatusButton ticketId={ticket.id} nextStatus={nextStatus} />
        </div>
      )}

      <h2 className="font-bold mb-2">Status History</h2>
      <ul className="text-sm mb-6 space-y-1">
        {history.map((h, i) => (
          <li key={i}>
            {new Date(h.changed_at).toLocaleString()} — {h.status}
            {h.admin_name ? ` (${h.admin_name})` : ""}
          </li>
        ))}
        {history.length === 0 && <li className="text-gray-500">No status changes yet.</li>}
      </ul>

      <h2 className="font-bold mb-2">Office Reassignments</h2>
      <ul className="text-sm mb-6 space-y-1">
        {reassignments.map((r, i) => (
          <li key={i}>
            {new Date(r.reassigned_at).toLocaleString()} — {r.from_office} → {r.to_office}
            {r.admin_name ? ` (${r.admin_name})` : ""}
          </li>
        ))}
        {reassignments.length === 0 && (
          <li className="text-gray-500">No reassignments yet.</li>
        )}
      </ul>

      <h2 className="font-bold mb-2">Member Reports ({reports.length})</h2>
      <div className="space-y-4">
        {reports.map((r) => (
          <div key={r.id} className="border p-4 rounded flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image_url} alt={r.title} className="w-32 h-32 object-cover rounded" />
            <div>
              <h3 className="font-medium">{r.title}</h3>
              {r.description && <p className="text-sm text-gray-600">{r.description}</p>}
              {/* Citizen's own severity rating, kept distinct from the
                  computed urgency_score shown above — PLAN.md §5. */}
              <p className="text-sm mt-1">
                <strong>Reported as:</strong> {r.citizen_severity}
              </p>
              <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
