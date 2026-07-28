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

const PROGRESS_STEPS = [
  { status: "Reported", note: "Received" },
  { status: "Under Review", note: "Queued" },
  { status: "In Progress", note: "Work ongoing" },
  { status: "Resolved", note: "Closed" },
];

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

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
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

function ProgressSteps({ status }: { status: string }) {
  const isRejected = status === "Rejected";
  const currentIndex = isRejected ? -1 : PROGRESS_STEPS.findIndex((s) => s.status === status);

  return (
    <div className="flex items-start">
      <div className="flex flex-1 items-start">
        {PROGRESS_STEPS.map((step, i) => {
          const isReached = currentIndex >= 0 && i <= currentIndex;
          const rightFilled = isReached && i < currentIndex;

          return (
            <div key={step.status} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div
                  className="h-0.5 flex-1"
                  style={{
                    visibility: i === 0 ? "hidden" : "visible",
                    background: isReached ? "var(--color-brand-500)" : "var(--color-line-200)",
                  }}
                />
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={
                    isReached
                      ? { background: "var(--color-brand-500)", color: "white" }
                      : { background: "var(--color-line-100)", color: "var(--color-ink-400)" }
                  }
                >
                  {isReached ? <CheckIcon /> : i + 1}
                </div>
                <div
                  className="h-0.5 flex-1"
                  style={{
                    visibility: i === PROGRESS_STEPS.length - 1 ? "hidden" : "visible",
                    background: rightFilled ? "var(--color-brand-500)" : "var(--color-line-200)",
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] font-semibold text-ink-900">{step.status}</p>
              <p className="mt-0.5 text-[11px] text-ink-400">{step.note}</p>
            </div>
          );
        })}
      </div>

      {/* Rejected — a separate outcome, not a 5th step in the pipeline, so it's
          deliberately not wired into the connector line above. */}
      <div className="ml-4 flex flex-shrink-0 flex-col items-center border-l border-dashed border-line-200 pl-4 text-center">
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={
            isRejected
              ? { background: STATUS_STYLE.Rejected.dot, color: "white" }
              : { background: "var(--color-line-100)", color: "var(--color-ink-400)" }
          }
        >
          {isRejected && <XIcon />}
        </div>
        <p className="mt-2 text-[12px] font-semibold text-ink-900">Rejected</p>
        <p className="mt-0.5 text-[11px] text-ink-400">Not accepted</p>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  caption,
  note,
  tint,
  ink,
}: {
  label: string;
  value: number;
  caption: string;
  note: string;
  tint: string;
  ink: string;
}) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
        style={{ background: tint, color: ink }}
      >
        {label}
      </span>
      <p className="mt-3 font-mono text-[28px] font-medium leading-[32px] tabular-nums text-ink-900">{value}</p>
      <p className="mt-1.5 text-[14px] font-medium text-ink-700">{caption}</p>
      <p className="mt-1 text-[12px] leading-[16px] text-ink-500">{note}</p>
    </div>
  );
}

export default async function MyReportsPage() {
  const session = await getCitizenSession();
  if (!session) return null;

  const reports = await getMyReports(session.citizenId);

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
          caption="High-severity"
          note="Live totals based on your submitted hazard reports."
          tint="var(--color-urgency-critical-tint)"
          ink="var(--color-urgency-critical-ink)"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {reports.map((report, idx) => {
          const pill = STATUS_STYLE[report.status] ?? FALLBACK_STYLE;
          return (
            <div
              key={report.id}
              className="flex flex-col overflow-hidden rounded-xl border border-line-200 bg-surface transition-shadow duration-[120ms] hover:shadow-sm"
            >
              <div className="relative h-48 w-full overflow-hidden bg-line-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={report.image_url} alt={report.title} className="h-full w-full object-cover" />
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

                  <div className="flex-1 overflow-x-auto">
                    <ProgressSteps status={report.status} />
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