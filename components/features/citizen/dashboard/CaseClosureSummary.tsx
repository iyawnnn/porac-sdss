import type { MyReportDetail } from "@/lib/types/citizens-reports";
import { ReportImage } from "@/components/features/citizen/dashboard/ReportImage";

// Citizen-safe summary of how this report was closed — deliberately reads
// only fields already present on MyReportDetail (resolution_notes/
// resolution_image_url/ticket_updated_at/disputed_at/resolution_confirmed_at),
// the same "no admin notes, no scoring internals" rule ReportTimeline
// follows. Distinct from ResolutionFeedback below it: this is a read-only
// recap of the outcome, not the confirm/dispute action itself.
function feedbackStateLine(report: Pick<MyReportDetail, "disputed_at" | "resolution_confirmed_at">): string | null {
  if (report.disputed_at) return "You reported that this issue isn't actually fixed.";
  if (report.resolution_confirmed_at) return "You confirmed this issue was fixed.";
  return null;
}

export default function CaseClosureSummary({
  report,
}: {
  report: Pick<
    MyReportDetail,
    "resolution_notes" | "resolution_image_url" | "ticket_updated_at" | "disputed_at" | "resolution_confirmed_at"
  >;
}) {
  const resolvedDate = new Date(report.ticket_updated_at);
  const feedbackLine = feedbackStateLine(report);

  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink-900">Case Closure Summary</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">
            Resolved {resolvedDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-resolved-tint px-2.5 py-1 text-xs font-medium text-status-resolved-ink">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-status-resolved-ink" aria-hidden="true" />
          Resolved
        </span>
      </div>

      {report.resolution_notes && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Resolution Notes</p>
          <p className="mt-1 text-[14px] leading-[20px] text-ink-700">{report.resolution_notes}</p>
        </div>
      )}

      {report.resolution_image_url && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-400">Resolution Photo</p>
          <div className="overflow-hidden rounded-lg border border-line-100">
            <ReportImage
              alt="Photo taken by staff confirming the resolution"
              className="h-48 w-full object-cover sm:h-56"
              src={report.resolution_image_url}
            />
          </div>
        </div>
      )}

      {feedbackLine && (
        <div className="mt-4 rounded-lg bg-canvas p-3">
          <p className="text-[13px] leading-[18px] text-ink-700">{feedbackLine}</p>
        </div>
      )}
    </div>
  );
}
