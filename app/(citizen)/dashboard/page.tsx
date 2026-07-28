import Link from "next/link";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import { getMyReports } from "@/lib/citizens/reports";

// Status pill tokens — exact values from DESIGN.md §2.3.
// Under Review / In Progress intentionally reuse brand-50/100/700/900/500/600
// verbatim; no new blues are introduced (see §2.3 rationale).
const STATUS_STYLE: Record<
  string,
  { tint: string; ink: string; dot: string }
> = {
  Reported: {
    tint: "#F1F3F5",
    ink: "#434B54",
    dot: "#98A2AC",
  },
  "Under Review": {
    tint: "#EFF5FC", // brand-50
    ink: "#1A4570", // brand-700
    dot: "#2B6CB0", // brand-500
  },
  "In Progress": {
    tint: "#D8E6F7", // brand-100
    ink: "#102943", // brand-900
    dot: "#22578E", // brand-600
  },
  Resolved: {
    tint: "#E3F5EE",
    ink: "#0B5741",
    dot: "#0F7A5A",
  },
};

const FALLBACK_STYLE = { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" };

export default async function DashboardPage() {
  const session = await getCitizenSession();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const reports = await getMyReports(session.citizenId);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">My Reports</h1>
        <Link href="/report" className="text-brand-500 underline text-sm">
          + Report a hazard
        </Link>
      </div>

      <div className="space-y-4">
        {reports.map((r) => {
          const pill = STATUS_STYLE[r.status] ?? FALLBACK_STYLE;
          return (
            <Link
              key={r.id}
              href={`/dashboard/reports/${r.id}`}
              className="border border-line-200 p-4 rounded-lg flex gap-4 hover:bg-canvas transition-colors duration-120"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image_url} alt={r.title} className="w-24 h-24 object-cover rounded" />
              <div>
                <h2 className="font-medium text-ink-900">{r.title}</h2>
                <p className="text-sm text-ink-500">
                  {r.category} · reported as {r.citizen_severity}
                </p>
                {/* Status pill — tint bg + ink text + 8px leading dot (§2.3 / §5.2) */}
                <p className="text-sm mt-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: pill.tint, color: pill.ink }}
                    data-status={r.status}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: pill.dot }}
                      aria-hidden="true"
                    />
                    {r.status}
                  </span>
                </p>
                <p className="text-xs text-ink-400 mt-1 font-mono tabular-nums">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
            </Link>
          );
        })}
        {reports.length === 0 && (
          <p className="text-ink-500">No reports yet. File one from the map.</p>
        )}
      </div>
    </main>
  );
}
