import Link from "next/link";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { MyReportRow } from "@/lib/types/citizens-reports";
import { StatTile } from "@/components/features/citizen/dashboard/StatTile";
import { REPORT_STATUS_STYLE, REPORT_STATUS_FALLBACK } from "@/components/features/citizen/dashboard/reportStatusStyle";
import { CitizenUnauthorized } from "@/components/features/citizen/dashboard/CitizenUnauthorized";
import { ReportImage } from "@/components/features/citizen/dashboard/ReportImage";
import { latestUpdateLine, officeLabel } from "@/lib/utils/citizen-report-copy";

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
      <path
        d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
      <rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
      <path
        d="M11 4h6a3 3 0 0 1 3 3v6a2 2 0 0 1-.59 1.41l-7 7a2 2 0 0 1-2.82 0l-6-6a2 2 0 0 1 0-2.82l7-7A2 2 0 0 1 11 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="8.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function OfficeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
      <path d="M4 21V9l8-5 8 5v12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-ink-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-[13px] font-medium text-ink-900">{value}</p>
    </div>
  );
}

export default async function MyReportsPage() {
  const session = await getCitizenSessionFromApi();
  if (!session) return <CitizenUnauthorized />;

  const reports = await apiGet<MyReportRow[]>("/reports/mine");

  const resolvedCount = reports.filter((r) => r.status === "Resolved").length;
  const activeCount = reports.filter((r) => r.status !== "Resolved" && r.status !== "Rejected").length;
  const criticalCount = reports.filter((r) => r.urgency_band === "Critical").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-line-200 bg-surface p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-brand-700">
            Citizen Portal
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink-900">My Reports</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-[22px] text-ink-500">
            Track the status of every hazard you submitted, review updates from the city team, and confirm the
            location and photo tied to each report.
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
          label="Total Reports"
          value={reports.length}
          caption="Reports submitted"
          note="Live totals based on your submitted hazard reports."
          tint="var(--color-line-100)"
          ink="var(--color-ink-500)"
        />
        <StatTile
          label="Active"
          value={activeCount}
          caption="Still awaiting closure"
          note="Live totals based on your submitted hazard reports."
          tint="var(--color-brand-50)"
          ink="var(--color-brand-700)"
        />
        <StatTile
          label="Resolved"
          value={resolvedCount}
          caption="Closed reports"
          note="Live totals based on your submitted hazard reports."
          tint="var(--color-status-resolved-tint)"
          ink="var(--color-status-resolved-ink)"
        />
        <StatTile
          label="Critical"
          value={criticalCount}
          caption="High-urgency"
          note="Live totals based on your submitted hazard reports."
          tint="var(--color-urgency-critical-tint)"
          ink="var(--color-urgency-critical-ink)"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {reports.map((report, idx) => {
          const pill = REPORT_STATUS_STYLE[report.status] ?? REPORT_STATUS_FALLBACK;
          return (
            <div
              key={report.id}
              className="flex flex-col overflow-hidden rounded-xl border border-line-200 bg-surface transition-shadow duration-[120ms] hover:shadow-sm"
            >
              <div className="relative h-48 w-full overflow-hidden bg-line-100">
                <ReportImage alt={report.title} className="h-full w-full object-cover" src={report.image_url} />
                <span className="absolute left-3 top-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface/90 px-2 text-xs font-semibold text-ink-700">
                  #{idx + 1}
                </span>
                <span
                  className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm"
                  style={{ background: pill.tint, color: pill.ink }}
                  data-status={report.status}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: pill.dot }} aria-hidden="true" />
                  {report.status}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <h2 className="text-[18px] font-semibold leading-[26px] tracking-[-0.005em] text-ink-900">
                  {report.title}
                </h2>

                <div className="mt-4 flex flex-1 flex-col space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <MetaItem icon={<PinIcon />} label="Location" value={report.barangay_name} />
                    <MetaItem
                      icon={<CalendarIcon />}
                      label="Submitted"
                      value={new Date(report.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    />
                    <MetaItem icon={<TagIcon />} label="Category" value={report.category} />
                  </div>

                  <div className="border-t border-line-100" />

                  <div className="flex flex-col gap-2">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line-200 px-2.5 py-1 text-[11px] font-medium text-ink-700">
                      <OfficeIcon />
                      {officeLabel(report.assigned_office)}
                    </span>
                    <p className="text-[13px] leading-[18px] text-ink-500">{latestUpdateLine(report)}</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <Link
                    href={`/dashboard/reports/${report.id}`}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-medium leading-none text-white transition-colors duration-[120ms] hover:bg-brand-600"
                  >
                    View Details
                  </Link>
                  <Link
                    href="/map"
                    className="inline-flex h-11 w-28 items-center justify-center gap-1.5 rounded-md border border-line-200 px-4 text-sm font-medium leading-none text-ink-700 transition-colors duration-[120ms] hover:bg-canvas"
                  >
                    <PinIcon />
                    Map
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {reports.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-200 bg-surface px-6 py-16 text-center sm:col-span-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-400">
              <path
                d="M3 7.5 5.25 4h13.5L21 7.5M3 7.5v9A1.5 1.5 0 0 0 4.5 18h15a1.5 1.5 0 0 0 1.5-1.5v-9M3 7.5h5.25l1 2h5.5l1-2H21"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <p className="text-[16px] font-semibold leading-[24px] text-ink-900">No reports yet</p>
              <p className="mt-1 text-[15px] leading-[22px] text-ink-500">
                Reports you submit will show up here with their current status.
              </p>
            </div>
            <Link
              href="/report"
              className="mt-2 inline-flex h-11 items-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600"
            >
              Report Hazard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}