import Link from "next/link";
import { getCitizenSession } from "@/lib/auth/getCitizenSession";
import { getMyReports } from "@/lib/citizens/reports";

const STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570", dot: "#2B6CB0" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943", dot: "#22578E" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741", dot: "#0F7A5A" },
  Rejected: { tint: "#FDEAEA", ink: "#8A1D12", dot: "#B42318" },
};

const FALLBACK_STYLE = { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" };

export default async function MyReportsPage() {
  const session = await getCitizenSession();
  if (!session) return null;

  const reports = await getMyReports(session.citizenId);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">My Reports</h1>
          <p className="text-sm text-ink-500">Reports submitted by {session.email}</p>
        </div>
        <Link href="/report" className="h-10 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          Report Hazard
        </Link>
      </div>

      <div className="space-y-3">
        {reports.map((report) => {
          const pill = STATUS_STYLE[report.status] ?? FALLBACK_STYLE;
          return (
            <Link
              key={report.id}
              href={`/dashboard/reports/${report.id}`}
              className="grid gap-4 rounded-md border border-line-200 bg-surface p-4 transition-colors hover:bg-canvas sm:grid-cols-[7rem_1fr_auto]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={report.image_url} alt={report.title} className="h-28 w-28 rounded-md object-cover" />
              <div className="min-w-0">
                <h2 className="font-medium text-ink-900">{report.title}</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {report.category} - {report.barangay_name}
                </p>
                <p className="mt-1 text-sm text-ink-500">Reported as {report.citizen_severity}</p>
                <p className="mt-2 text-xs font-mono tabular-nums text-ink-400">
                  {new Date(report.created_at).toLocaleString()}
                </p>
              </div>
              <div className="sm:text-right">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: pill.tint, color: pill.ink }}
                  data-status={report.status}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: pill.dot }} aria-hidden="true" />
                  {report.status}
                </span>
              </div>
            </Link>
          );
        })}
        {reports.length === 0 && (
          <div className="rounded-md border border-line-200 bg-surface p-6 text-sm text-ink-500">
            No reports yet. Submit one from Report Hazard.
          </div>
        )}
      </div>
    </main>
  );
}
