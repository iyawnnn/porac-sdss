import Link from "next/link";
import { sql } from "@/lib/db/raw";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getTicketsForAdmin } from "@/lib/admin/tickets";
import { getAdminSession } from "@/lib/auth/getSession";

const BAND_CLASSES: Record<string, string> = {
  Low: "bg-green-100 text-green-800",
  Medium: "bg-amber-100 text-amber-800",
  Critical: "bg-red-100 text-red-800",
};

const STATUSES = ["Reported", "Under Review", "In Progress", "Resolved"];

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string; status?: string; barangayId?: string }>;
}) {
  const params = await searchParams;
  const session = await getAdminSession();

  // Recompute urgency against current weather before the queue is shown,
  // so an admin opening the queue always sees fresh numbers.
  const recomputeResult = await recomputeActiveTicketUrgency();

  // Default to the logged-in admin's own office (PLAN.md §10: "each office
  // sees its own queue by default"). ?office=all is the explicit full-city
  // toggle; ?office=CEO/ACDRRMO overrides the default either direction.
  const office =
    params.office === "all"
      ? undefined
      : params.office === "CEO" || params.office === "ACDRRMO"
        ? params.office
        : session?.office;
  const isDefaultOfficeView = params.office === undefined;

  const status = params.status && STATUSES.includes(params.status) ? params.status : undefined;
  const barangayId = params.barangayId ? Number(params.barangayId) : undefined;

  const [tickets, barangays] = await Promise.all([
    getTicketsForAdmin({ office, status, barangayId }),
    sql<{ id: number; name: string }[]>`SELECT id, name FROM barangays ORDER BY name`,
  ]);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold">Ticket Queue</h1>
        <p className="text-xs text-gray-500">
          Recomputed just now — rain: {recomputeResult.rain1hMm}mm/h, {recomputeResult.updated}{" "}
          active ticket(s)
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 text-sm">
        <span>
          Showing: <strong>{office ?? "All offices (full city)"}</strong>
          {isDefaultOfficeView && session?.office ? " (your office, default)" : ""}
        </span>
        {office !== undefined && (
          <Link href="/admin/tickets?office=all" className="text-blue-600 underline">
            View full city
          </Link>
        )}
        {office === undefined && session?.office && (
          <Link href="/admin/tickets" className="text-blue-600 underline">
            View my office ({session.office})
          </Link>
        )}
      </div>

      <form className="flex gap-3 mb-4 flex-wrap" method="GET">
        <select name="office" defaultValue={params.office ?? session?.office ?? "all"} className="border p-2">
          <option value="all">All offices</option>
          <option value="CEO">CEO</option>
          <option value="ACDRRMO">ACDRRMO</option>
        </select>

        <select name="status" defaultValue={status ?? ""} className="border p-2">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select name="barangayId" defaultValue={barangayId ?? ""} className="border p-2">
          <option value="">All barangays</option>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded">
          Filter
        </button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="p-2">ID</th>
            <th className="p-2">Category</th>
            <th className="p-2">Barangay</th>
            <th className="p-2">Members</th>
            <th className="p-2">Urgency</th>
            <th className="p-2">Office</th>
            <th className="p-2">Status</th>
            <th className="p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b hover:bg-gray-50">
              <td className="p-2">
                <Link href={`/admin/tickets/${t.id}`} className="text-blue-600 underline">
                  #{t.id}
                </Link>
              </td>
              <td className="p-2">{t.category}</td>
              <td className="p-2">{t.barangay_name}</td>
              <td className="p-2">{t.member_count}</td>
              <td className="p-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    BAND_CLASSES[t.urgency_band ?? ""] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {t.urgency_band ?? "—"} ({t.urgency_score?.toFixed(3) ?? "—"})
                </span>
              </td>
              <td className="p-2">{t.assigned_office}</td>
              <td className="p-2">{t.status}</td>
              <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-center text-gray-500">
                No tickets match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
