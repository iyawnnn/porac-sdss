import Link from "next/link";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { MyReportRow } from "@/lib/types/citizens-reports";
import type { PublicTicketGeoRow, BarangayGeoFeatureCollection } from "@/lib/types/citizens-public-map";
import PublicMapClientLoader from "@/components/features/citizen/map/PublicMapClientLoader";
import { StatTile } from "@/components/features/citizen/dashboard/StatTile";
import { REPORT_STATUS_STYLE, REPORT_STATUS_FALLBACK } from "@/components/features/citizen/dashboard/reportStatusStyle";

function timeAgo(isoDate: string) {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secondsPerUnit, label] of units) {
    const value = Math.floor(seconds / secondsPerUnit);
    if (value >= 1) return `${value} ${label}${value > 1 ? "s" : ""} ago`;
  }
  return "Just now";
}

export default async function DashboardPage() {
  const session = await getCitizenSessionFromApi();
  // proxy.ts already redirects unauthenticated requests before this
  // renders; this null-check is just defense in depth.
  if (!session) return null;

  const [reports, publicMap] = await Promise.all([
    apiGet<MyReportRow[]>("/reports/mine"),
    apiGet<{ barangays: BarangayGeoFeatureCollection; tickets: PublicTicketGeoRow[] }>("/public-map"),
  ]);
  const { barangays, tickets } = publicMap;

  const activeCount = reports.filter((r) => r.status !== "Resolved" && r.status !== "Rejected").length;
  const citywideCriticalCount = tickets.filter((t) => t.urgency_band === "Critical").length;
  const recentReports = reports.slice(0, 3);
  const firstName = session.citizenName.split(" ")[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-line-200 bg-surface p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-brand-700">
            Citizen Portal
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink-900">
            Welcome back, {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-[22px] text-ink-500">
            Here&apos;s what&apos;s happening across Porac and with the hazards you&apos;ve reported.
          </p>
        </div>
        <Link
          href="/report"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-500 px-5 text-base font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600 hover:shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          Report New Hazard
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="My Reports"
          value={reports.length}
          caption="All-time submissions"
          note="Reports you've submitted since joining."
          tint="var(--color-line-100)"
          ink="var(--color-ink-500)"
        />
        <StatTile
          label="My Active"
          value={activeCount}
          caption="Awaiting resolution"
          note="Your reports still in the pipeline."
          tint="var(--color-brand-50)"
          ink="var(--color-brand-700)"
        />
        <StatTile
          label="Citywide Active"
          value={tickets.length}
          caption="Public hazards right now"
          note="Active, unflagged hazards across Porac."
          tint="var(--color-status-resolved-tint)"
          ink="var(--color-status-resolved-ink)"
        />
        <StatTile
          label="Citywide Critical"
          value={citywideCriticalCount}
          caption="High-urgency hazards"
          note="Critical-band tickets across all barangays."
          tint="var(--color-urgency-critical-tint)"
          ink="var(--color-urgency-critical-ink)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 rounded-xl border border-line-200 bg-surface p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-ink-900">Recent Activity</h2>
            <Link href="/reports" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              View all
            </Link>
          </div>

          {recentReports.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-200 px-6 py-10 text-center">
              <p className="text-[15px] font-semibold text-ink-900">No reports yet</p>
              <p className="text-sm text-ink-500">Reports you submit will show up here with their current status.</p>
              <Link
                href="/report"
                className="mt-1 inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                Report Hazard
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentReports.map((report) => {
                const pill = REPORT_STATUS_STYLE[report.status] ?? REPORT_STATUS_FALLBACK;
                return (
                  <Link
                    key={report.id}
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line-200 p-3 transition-colors duration-[120ms] hover:bg-canvas"
                  >
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: pill.dot }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink-900">{report.title}</p>
                      <p className="text-[12px] text-ink-500">
                        {report.barangay_name} &middot; {timeAgo(report.created_at)}
                      </p>
                    </div>
                    <span
                      className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{ background: pill.tint, color: pill.ink }}
                    >
                      {report.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-line-200 bg-surface p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-ink-900">Hazard Map</h2>
            <Link href="/map" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              View full map
            </Link>
          </div>
          <div className="h-[420px] w-full overflow-hidden rounded-lg border border-line-200">
            <PublicMapClientLoader barangays={barangays} tickets={tickets} heightClassName="h-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
