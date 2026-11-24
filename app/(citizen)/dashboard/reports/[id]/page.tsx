import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Info, Layers, MapPin, ShieldAlert } from "lucide-react";
import { apiGetOptional } from "@/lib/api-client";
import type { MyReportDetailResponse } from "@/lib/types/citizens-reports";
import {
  duplicateCopy,
  officeLabel,
  quarantinedCopy,
  resolvedUpdateLine,
  statusCopy,
  trackedTogetherCopy,
} from "@/lib/utils/citizen-report-copy";
import { PROGRESS_STAGES, reportProgress, type ProgressStage } from "@/lib/utils/report-progress";
import LocationPreviewMapLoader from "@/components/features/citizen/dashboard/LocationPreviewMapLoader";
import ReportTimeline from "@/components/features/citizen/dashboard/ReportTimeline";
import ResolutionFeedback from "@/components/features/citizen/dashboard/ResolutionFeedback";
import CaseClosureSummary from "@/components/features/citizen/dashboard/CaseClosureSummary";
import { ReportImage } from "@/components/features/citizen/dashboard/ReportImage";
import { ProgressTracker } from "@/components/features/citizen/reports/ProgressTracker";
import { CategoryIcon, StatusPill } from "@/components/features/citizen/reports/report-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// The Hazard Urgency badge (header chip and "Urgency" tile) was removed in
// manuscript revision Phase 1, step 6c — citizens are shown no system score.

const PANEL = "rounded-xl border border-border bg-card";
const PANEL_TITLE = "border-b border-border px-5 py-3.5 text-sm font-semibold";
const longDate: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
const mediumDate: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const shortDate = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

function Notice({ tone, icon: Icon, title, children }: { tone: "warning" | "info"; icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <Alert className={tone === "warning" ? "border-warning-edge bg-warning-tint text-warning-ink" : "border-border bg-card"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className={tone === "warning" ? "text-warning-ink" : undefined}>{children}</AlertDescription>
    </Alert>
  );
}

// A label over its value, laid out in the panels' two-column fact grids.
function Fact({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function MyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A 401 here (not logged in) and a 404 (report not found / not owned by
  // this citizen) are both "nothing to show" — proxy.ts already redirects
  // unauthenticated requests before this renders, so 401 is defense in
  // depth only, and 404 is the API's own ownership check.
  const data = await apiGetOptional<MyReportDetailResponse>(`/reports/mine/${id}`, [401, 404]);
  if (!data) notFound();

  const { report, history, referrals } = data;
  const submitted = new Date(report.created_at);
  const copy = statusCopy(report.status);
  const latestUpdate = resolvedUpdateLine(report) ?? copy.update;
  const corrected = report.corrected_lat !== null && report.corrected_lng !== null;
  const lat = report.corrected_lat ?? report.lat;
  const lng = report.corrected_lng ?? report.lng;

  // The tracker from the recorded history: which stages were entered, and when (the latest entry of
  // each, so a report sent back under review shows its newest review date). Reported is the submission.
  const reached = history.map((h) => h.status);
  const dates: Partial<Record<ProgressStage, string>> = { Reported: shortDate.format(submitted) };
  for (const step of history) {
    if ((PROGRESS_STAGES as readonly string[]).includes(step.status)) dates[step.status as ProgressStage] = shortDate.format(new Date(step.changed_at));
  }
  // A rejection is dated on the stage the report left the workflow from.
  const rejectedAt = history.findLast((h) => h.status === "Rejected");
  const exit = reportProgress(report.status, reached).stages.find((stage) => stage.state === "rejected");
  if (rejectedAt && exit) dates[exit.label] = shortDate.format(new Date(rejectedAt.changed_at));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/reports"
        className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />My Reports
      </Link>

      {/* One summary card: what was reported, where it stands, and what the municipality last said. */}
      <section aria-labelledby="report-title" className={cn(PANEL, "overflow-hidden")}>
        <header className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 gap-3.5">
            <CategoryIcon category={report.category} size={48} className="mt-0.5" />
            <div className="min-w-0">
              <Text as="h1" id="report-title" variant="heading" className="[overflow-wrap:anywhere]">{report.title}</Text>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{report.category}</span>
                <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{report.barangay_name}</span>
                <span className="font-mono text-xs">{report.tracking_reference}</span>
              </p>
            </div>
          </div>
          <StatusPill status={report.status} className="w-fit shrink-0 px-2.5 py-1 text-sm" />
        </header>
        <div className="border-t border-border px-2 pt-5 pb-4 sm:px-8">
          <h2 className="sr-only">Progress</h2>
          <ProgressTracker status={report.status} reached={reached} dates={dates} size="lg" />
        </div>
        {latestUpdate && (
          <div className="flex items-start gap-2.5 border-t border-border bg-muted/50 px-5 py-3.5">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-medium">Latest update: </span>
              {latestUpdate}
            </p>
          </div>
        )}
      </section>

      {(report.moderation_status === "quarantined" || report.moderation_status === "duplicate" || report.other_reports_count > 0) && (
        <div className="flex flex-col gap-2">
          {report.moderation_status === "quarantined" && (
            <Notice tone="warning" icon={ShieldAlert} title={quarantinedCopy(report.title).title}>{quarantinedCopy(report.title).message}</Notice>
          )}
          {report.moderation_status === "duplicate" && (
            <Notice tone="info" icon={Layers} title={duplicateCopy(report.title).title}>{duplicateCopy(report.title).message}</Notice>
          )}
          {/* Manuscript revision Phase 6, step 6b: the merge comes from the
              staff merge that moved this report (is_merged), so the
              reporter whose ticket others were merged into is never told
              their own report was merged; only the count of the other
              reports, never their references. */}
          {report.moderation_status !== "duplicate" && report.other_reports_count > 0 && (
            <Notice tone="info" icon={Layers} title={report.is_merged ? "Merged with an existing issue" : "Other residents reported this issue too"}>
              {trackedTogetherCopy(report.other_reports_count)}
            </Notice>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {report.status === "Resolved" && (
            <>
              <CaseClosureSummary report={report} />
              <ResolutionFeedback reportId={report.id} myFeedback={report.my_feedback} />
            </>
          )}

          <section aria-labelledby="reported-heading" className={PANEL}>
            <h2 id="reported-heading" className={PANEL_TITLE}>What you reported</h2>
            <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <div className="aspect-[16/10] w-full self-start sm:aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
                <ReportImage alt={report.title} className="h-full w-full object-cover" src={report.image_url} />
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                {report.description && <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">{report.description}</p>}
                <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-3.5", report.description && "border-t border-border pt-4")}>
                  {/* The ticket's current category, which staff may have corrected (manuscript revision
                      Phase 3, step 3e); what the citizen reported stays visible beside it. */}
                  <Fact label="Category" className="col-span-2">
                    {report.category}
                    {report.submitted_category !== report.category && (
                      <span className="mt-0.5 block text-muted-foreground">You reported: {report.submitted_category}</span>
                    )}
                  </Fact>
                  <Fact label="Severity you chose">{report.citizen_severity}</Fact>
                  <Fact label="Submitted">
{submitted.toLocaleDateString(undefined, mediumDate)}
                  </Fact>
                  <Fact label="Responsible office" className="col-span-2">{officeLabel(report.assigned_office)}</Fact>
                </dl>
              </div>
            </div>
          </section>

          <section aria-labelledby="timeline-heading" className={PANEL}>
            <div className="border-b border-border px-5 py-3.5">
              <h2 id="timeline-heading" className="text-sm font-semibold">Timeline</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Submitted {submitted.toLocaleDateString(undefined, longDate)}
                {copy.subtitle && ` · ${copy.subtitle}`}
              </p>
            </div>
            <div className="px-5 py-4">
              <ReportTimeline report={report} history={history} referrals={referrals} />
            </div>
          </section>
        </div>

        <section aria-labelledby="location-heading" className={cn(PANEL, "overflow-hidden lg:sticky lg:top-6")}>
          <h2 id="location-heading" className={PANEL_TITLE}>Location</h2>
          <div className="border-b border-border">
            <LocationPreviewMapLoader lat={report.lat} lng={report.lng} category={report.category} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 p-5">
            <Fact label="Barangay">{report.barangay_name}</Fact>
            <Fact label="Coordinates">
              <span className="font-mono text-xs tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              {corrected && <span className="mt-0.5 block text-xs text-muted-foreground">Corrected by municipal staff</span>}
            </Fact>
          </dl>
          <div className="px-5 pb-5">
            <Button asChild variant="outline" className="h-10 w-full gap-2 active:not-aria-[haspopup]:translate-y-0">
              <a href={`https://www.google.com/maps?q=${report.lat},${report.lng}`} target="_blank" rel="noopener noreferrer">
                Open in Google Maps<ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
