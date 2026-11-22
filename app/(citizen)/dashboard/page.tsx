import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { MyReportRow } from "@/lib/types/citizens-reports";
import type { PublicTicketGeoRow, BarangayGeoFeatureCollection } from "@/lib/types/citizens-public-map";
import PublicMapClientLoader from "@/components/features/citizen/map/PublicMapClientLoader";
import { REPORT_STATUS_STYLE, REPORT_STATUS_FALLBACK } from "@/components/features/citizen/dashboard/reportStatusStyle";
import { CitizenUnauthorized } from "@/components/features/citizen/dashboard/CitizenUnauthorized";
import { EmergencyNotice } from "@/components/features/citizen/emergency/EmergencyNotice";
import { Button } from "@/components/ui/button";

const reportDate = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

export default async function DashboardPage() {
  const session = await getCitizenSessionFromApi();
  if (!session) return <CitizenUnauthorized />;

  const [reports, { barangays, tickets }] = await Promise.all([
    apiGet<MyReportRow[]>("/reports/mine"),
    apiGet<{ barangays: BarangayGeoFeatureCollection; tickets: PublicTicketGeoRow[] }>("/public-map"),
  ]);

  let active = 0;
  let resolved = 0;
  for (const report of reports) {
    if (report.status === "Resolved") resolved++;
    else if (report.status !== "Rejected") active++;
  }
  const summaries = [
    { label: "My Reports", count: reports.length },
    { label: "Active Reports", count: active },
    { label: "Resolved Reports", count: resolved },
  ];
  const recentReports = reports.slice(0, 3);
  const firstName = session.citizenName.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight text-foreground [overflow-wrap:anywhere] md:text-4xl">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Stay updated on your reports and concerns in Porac.
          </p>
        </div>
        <Button asChild className="min-h-11 gap-2 px-4 hover:bg-primary-hover active:not-aria-[haspopup]:translate-y-0">
          <Link href="/report"><Plus aria-hidden="true" /> Report a Concern</Link>
        </Button>
      </div>

      <EmergencyNotice className="rounded-lg border-l-4 px-3 py-2.5 sm:px-4" />

      <dl aria-label="Report summary" className="divide-y divide-border rounded-xl border border-border bg-surface sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {summaries.map(({ label, count }) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:flex-col sm:items-start sm:gap-1.5 sm:px-5 sm:py-4">
            <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
            <dd className="font-heading text-xl leading-tight font-semibold text-foreground tabular-nums sm:text-3xl">{count.toLocaleString("en-PH")}</dd>
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
        <section aria-labelledby="recent-reports" className="min-w-0 rounded-xl border border-border bg-surface">
          <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-3 px-4 sm:px-5">
            <h2 id="recent-reports" className="font-heading text-lg font-semibold">Recent Reports</h2>
            <Link href="/reports" className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary">
              <span className="link-underline">View all reports</span>
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <div className="border-t border-border px-4 py-6 sm:px-5">
              <p className="font-medium">No reports yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your submitted reports and their statuses will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {recentReports.map((report) => {
                const status = REPORT_STATUS_STYLE[report.status] ?? REPORT_STATUS_FALLBACK;
                return (
                  <li key={report.id}>
                    <Link href={`/dashboard/reports/${report.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-offset-[-3px] sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{report.title}</p>
                        <p className="mt-1 flex flex-wrap gap-x-2 text-xs leading-relaxed text-muted-foreground">
                          <span>{report.barangay_name}</span>
                          <time dateTime={report.created_at}>{reportDate.format(new Date(report.created_at))}</time>
                        </p>
                        <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: status.ink }}>
                          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: status.dot }} />
                          {report.status}
                        </span>
                      </div>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="public-report-map" className="min-w-0 rounded-xl border border-border bg-surface">
          <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-3 px-4 sm:px-5">
            <h2 id="public-report-map" className="font-heading text-lg font-semibold">Public Report Map</h2>
            <Link href="/map" className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary">
              <span className="link-underline">View Full Map</span>
            </Link>
          </div>
          <div className="isolate h-72 overflow-hidden rounded-b-xl border-t border-border bg-muted sm:h-84">
            <PublicMapClientLoader barangays={barangays} tickets={tickets} heightClassName="h-full" preview />
          </div>
        </section>
      </div>
    </main>
  );
}
