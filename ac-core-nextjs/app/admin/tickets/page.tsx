import Link from "next/link";
import { sql } from "@/lib/db/raw";
import { recomputeActiveTicketUrgency } from "@/lib/triage/recompute";
import { getTicketsForAdmin } from "@/lib/admin/tickets";
import { getAdminSession } from "@/lib/auth/getSession";
import { getUrgencyBandStyle } from "@/lib/ui/urgency";

const STATUSES = ["Reported", "Under Review", "In Progress", "Resolved"];

// Filter bar as chips (DESIGN.md §9 Phase 1) — same rounded-pill treatment
// on every native <select>, so the three filters and the submit button
// read as one control group instead of three bordered boxes.
const FILTER_CHIP_CLASS = "rounded-full border border-line-200 bg-surface px-3 py-1.5 text-sm text-ink-700";

const TH_CLASS = "h-10 px-3 text-xs font-medium uppercase tracking-wide text-ink-500";

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
  const status = params.status && STATUSES.includes(params.status) ? params.status : undefined;
  const barangayId = params.barangayId ? Number(params.barangayId) : undefined;

  const [tickets, barangays] = await Promise.all([
    getTicketsForAdmin({ office, status, barangayId }),
    sql<{ id: number; name: string }[]>`SELECT id, name FROM barangays ORDER BY name`,
  ]);

  return (
    <main className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-ink-900">Ticket Queue</h1>
        <p className="text-xs text-ink-400">
          Recomputed just now — rain: {recomputeResult.rain1hMm}mm/h, {recomputeResult.updated}{" "}
          active ticket(s)
        </p>
      </div>

      <form className="flex gap-2 mb-4 flex-wrap items-center" method="GET">
        <select
          name="office"
          defaultValue={params.office ?? session?.office ?? "all"}
          className={FILTER_CHIP_CLASS}
        >
          <option value="all">All offices</option>
          <option value="CEO">CEO</option>
          <option value="ACDRRMO">ACDRRMO</option>
        </select>

        <select name="status" defaultValue={status ?? ""} className={FILTER_CHIP_CLASS}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select name="barangayId" defaultValue={barangayId ?? ""} className={FILTER_CHIP_CLASS}>
          <option value="">All barangays</option>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-full bg-brand-500 hover:bg-brand-600 text-white px-4 py-1.5 text-sm font-medium"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line-200 bg-surface">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line-200 text-left">
              <th className={TH_CLASS}>ID</th>
              <th className={TH_CLASS}>Category</th>
              <th className={TH_CLASS}>Barangay</th>
              <th className={`${TH_CLASS} text-right`}>Members</th>
              <th className={TH_CLASS}>Urgency</th>
              <th className={`${TH_CLASS} text-right`}>Score</th>
              <th className={TH_CLASS}>Office</th>
              <th className={TH_CLASS}>Status</th>
              <th className={TH_CLASS}>Created</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="h-10 border-b border-line-100 hover:bg-canvas">
                <td className="px-3 font-mono text-ink-700">
                  <Link href={`/admin/tickets/${t.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                    #{t.id}
                  </Link>
                </td>
                <td className="px-3">{t.category}</td>
                <td className="px-3">{t.barangay_name}</td>
                <td className="px-3 text-right font-mono tabular-nums text-ink-700">{t.member_count}</td>
                <td className="px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${getUrgencyBandStyle(t.urgency_band).className}`}
                  >
                    {t.urgency_band ?? "—"}
                  </span>
                </td>
                <td className="px-3 text-right font-mono tabular-nums text-ink-700">
                  {t.urgency_score?.toFixed(3) ?? "—"}
                </td>
                <td className="px-3">{t.assigned_office}</td>
                <td className="px-3">{t.status}</td>
                <td className="px-3 font-mono text-xs text-ink-500">
                  {new Date(t.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-ink-400">
                  No tickets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
