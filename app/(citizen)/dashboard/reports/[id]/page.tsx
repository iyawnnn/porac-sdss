import { notFound } from "next/navigation";
import Link from "next/link";
import { apiGetOptional } from "@/lib/api-client";
import type { MyReportDetail, StatusHistoryStep } from "@/lib/types/citizens-reports";
import { getUrgencyBandStyle } from "@/lib/utils/ui/urgency";
import {
  duplicateCopy,
  mergedCopy,
  officeLabel,
  othersJoinedCopy,
  quarantinedCopy,
  resolvedUpdateLine,
  statusCopy,
} from "@/lib/utils/citizen-report-copy";
import LocationPreviewMapLoader from "@/components/features/citizen/dashboard/LocationPreviewMapLoader";
import ReportTimeline from "@/components/features/citizen/dashboard/ReportTimeline";
import ResolutionFeedback from "@/components/features/citizen/dashboard/ResolutionFeedback";
import { ReportImage } from "@/components/features/citizen/dashboard/ReportImage";

const STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570", dot: "#2B6CB0" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943", dot: "#22578E" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741", dot: "#0F7A5A" },
  Rejected: { tint: "#FDEAEA", ink: "#8A1D12", dot: "#B42318" },
};
const FALLBACK_STATUS_STYLE = { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" };

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
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

function TagIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
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

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OfficeIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 21V9l8-5 8 5v12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function InfoBanner({ tone, title, children }: { tone: "brand" | "amber" | "violet"; title: string; children: React.ReactNode }) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-900"
      : tone === "violet"
        ? "bg-violet-50 text-violet-900"
        : "bg-brand-50 text-ink-700";
  const titleClass = tone === "amber" ? "text-amber-700" : tone === "violet" ? "text-violet-700" : "text-brand-700";
  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 ${toneClass}`}>
      <ClockIcon className="mt-0.5 flex-shrink-0" />
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${titleClass}`}>{title}</p>
        <p className="mt-0.5 text-[13px] leading-[18px]">{children}</p>
      </div>
    </div>
  );
}

function OutlineChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-200 px-3 py-1 text-xs font-medium text-ink-700">
      {icon}
      {children}
    </span>
  );
}

function UrgencyBadge({ band }: { band: string }) {
  const style = getUrgencyBandStyle(band);
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}>
      {band}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const pill = STATUS_STYLE[status] ?? FALLBACK_STATUS_STYLE;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: pill.tint, color: pill.ink }}
      data-status={status}
    >
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: pill.dot }} aria-hidden="true" />
      {status}
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line-200 bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">{label}</span>
      </div>
      <p className="mt-2 truncate text-[15px] font-semibold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-ink-500">{sub}</p>}
    </div>
  );
}

function MiniTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-200 bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default async function MyReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A 401 here (not logged in) and a 404 (report not found / not owned by
  // this citizen) are both "nothing to show" — proxy.ts already redirects
  // unauthenticated requests before this renders, so 401 is defense in
  // depth only, and 404 is the API's own ownership check.
  const data = await apiGetOptional<{ report: MyReportDetail; history: StatusHistoryStep[] }>(
    `/reports/mine/${id}`,
    [401, 404],
  );

  if (!data) notFound();

  const { report, history } = data;

  const submittedDate = new Date(report.created_at);
  const updatedDate = new Date(report.ticket_updated_at);
  const dateFmt: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const copy = statusCopy(report.status);
  const citizenName = `${report.citizen_first_name} ${report.citizen_last_name}`;
  const initials = `${report.citizen_first_name[0] ?? ""}${report.citizen_last_name[0] ?? ""}`.toUpperCase();
  const resolvedUpdate = resolvedUpdateLine(report);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/reports" className="text-sm text-brand-500 underline">
        ← Back to my reports
      </Link>

      <div className="mt-4 rounded-xl border border-line-200 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OutlineChip>Report Details</OutlineChip>
              {report.urgency_band && <UrgencyBadge band={report.urgency_band} />}
              <OutlineChip>Citizen-submitted hazard</OutlineChip>
            </div>

            <h1 className="mt-3 text-[24px] font-semibold leading-[32px] tracking-[-0.01em] text-ink-900">
              {report.title}
            </h1>
            {report.description && (
              <p className="mt-2 max-w-xl text-[15px] leading-[22px] text-ink-500">{report.description}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <OutlineChip icon={<PinIcon className="text-ink-400" />}>{report.barangay_name}</OutlineChip>
              <OutlineChip icon={<TagIcon className="text-ink-400" />}>{report.category}</OutlineChip>
              <OutlineChip icon={<ClockIcon className="text-ink-400" />}>{report.status}</OutlineChip>
              <OutlineChip icon={<OfficeIcon className="text-ink-400" />}>{officeLabel(report.assigned_office)}</OutlineChip>
            </div>
            <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.04em] text-ink-400">
              Reported as <span className="text-ink-500">{report.citizen_severity}</span>
            </p>

            {(report.moderation_status === "quarantined" || report.moderation_status === "duplicate" || report.member_count > 1) && (
              <div className="mt-4 flex flex-col gap-2">
                {report.moderation_status === "quarantined" && (
                  <InfoBanner tone="amber" title={quarantinedCopy(report.title).title}>
                    {quarantinedCopy(report.title).message}
                  </InfoBanner>
                )}
                {report.moderation_status === "duplicate" && (
                  <InfoBanner tone="violet" title={duplicateCopy(report.title).title}>
                    {duplicateCopy(report.title).message}
                  </InfoBanner>
                )}
                {report.moderation_status !== "duplicate" && report.member_count > 1 && (
                  <InfoBanner tone="brand" title={report.is_merged ? "Merged with an existing issue" : "Other residents joined this report"}>
                    {report.is_merged ? mergedCopy(report.member_count) : othersJoinedCopy(report.member_count)}
                  </InfoBanner>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Current Status</p>
            <div className="mt-1.5">
              <StatusPill status={report.status} />
            </div>
            <p className="mt-1.5 text-[12px] text-ink-500">Last updated {updatedDate.toLocaleDateString(undefined, dateFmt)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            icon={<PinIcon />}
            label="Location"
            value={report.barangay_name}
            sub={`${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}`}
          />
          <StatTile icon={<TagIcon />} label="Category" value={report.category} sub="Hazard classification" />
          <StatTile
            icon={<CalendarIcon />}
            label="Submitted"
            value={submittedDate.toLocaleDateString(undefined, dateFmt)}
            sub={submittedDate.toLocaleTimeString(undefined, timeFmt)}
          />
          <StatTile
            icon={<ClockIcon />}
            label="Last Updated"
            value={updatedDate.toLocaleDateString(undefined, dateFmt)}
            sub={updatedDate.toLocaleTimeString(undefined, timeFmt)}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-line-200 bg-surface">
            <div className="relative h-64 w-full sm:h-72">
              <ReportImage alt={report.title} className="h-full w-full object-cover" src={report.image_url} />
              <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink-700">
                Submitted {submittedDate.toLocaleDateString(undefined, dateFmt)}
              </span>
              <span className="absolute right-3 top-3 shadow-sm">
                <StatusPill status={report.status} />
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-line-200 bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-ink-900">Timeline</h2>
                <p className="mt-0.5 text-[13px] text-ink-500">
                  Submitted {submittedDate.toLocaleDateString(undefined, dateFmt)}
                  {copy.subtitle && ` · ${copy.subtitle}`}
                </p>
              </div>
              <StatusPill status={report.status} />
            </div>

            <div className="mt-4 rounded-lg bg-canvas p-4">
              <ReportTimeline report={report} history={history} />
            </div>

            {(resolvedUpdate || copy.update) && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-brand-50 p-3">
                <ClockIcon className="mt-0.5 flex-shrink-0 text-brand-700" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-brand-700">Latest Update</p>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-ink-700">{resolvedUpdate ?? copy.update}</p>
                </div>
              </div>
            )}
          </div>

          {report.status === "Resolved" && (
            <ResolutionFeedback
              reportId={report.id}
              disputedAt={report.disputed_at}
              resolutionConfirmedAt={report.resolution_confirmed_at}
            />
          )}
        </div>

        <div className="rounded-xl border border-line-200 bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Citizen Record</p>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-line-200 p-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink-900">{citizenName}</p>
              <p className="truncate text-[12px] text-ink-500">Report submitted through Citizen Portal</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniTile label="Current Status">
              <StatusPill status={report.status} />
            </MiniTile>
            <MiniTile label="Urgency">
              {report.urgency_band ? (
                <UrgencyBadge band={report.urgency_band} />
              ) : (
                <span className="text-[13px] text-ink-500">Not yet scored</span>
              )}
            </MiniTile>
            <MiniTile label="Pinned Location">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                <PinIcon className="flex-shrink-0 text-ink-400" />
                {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
              </p>
            </MiniTile>
            <MiniTile label="Tracking ID">
              <p className="font-mono text-[13px] font-medium text-ink-900">#R{report.id}</p>
            </MiniTile>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Location Preview</p>
            <div className="overflow-hidden rounded-lg border border-line-100">
              <LocationPreviewMapLoader lat={report.lat} lng={report.lng} />
            </div>
          </div>

          <div className="mt-6 border-t border-line-100 pt-6">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Location Actions</p>
            <a
              href={`https://www.google.com/maps?q=${report.lat},${report.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-medium text-white transition-colors duration-[120ms] hover:bg-brand-600"
            >
              <PinIcon className="text-white" />
              Open in Google Maps
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}