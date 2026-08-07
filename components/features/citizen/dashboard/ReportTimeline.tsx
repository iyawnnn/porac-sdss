import type { MyReportDetail, StatusHistoryStep } from "@/lib/types/citizens-reports";

// Vertical, mobile-safe chronological timeline of citizen-safe events for a
// single report — replaces the old static, timestamp-less ProgressSteps
// stepper (duplicated across the list and detail pages) and the unused,
// fixed-4-step StatusTimeline component, neither of which could represent
// merge/moderation events. Deliberately only reads fields already present
// on MyReportDetail/StatusHistoryStep — no admin notes, raw flags, EXIF, or
// internal scoring ever reach this component.

type TimelineEventKind = "submitted" | "merged" | "status" | "quarantined" | "duplicate";

interface TimelineEvent {
  key: string;
  kind: TimelineEventKind;
  label: string;
  detail?: string;
  timestamp: string;
  adminName?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  Reported: "Report received",
  "Under Review": "Under review",
  "In Progress": "In progress",
  Resolved: "Resolved",
  Rejected: "Not accepted",
};

const KIND_STYLE: Record<TimelineEventKind, { dot: string; ink: string }> = {
  submitted: { dot: "var(--color-brand-500)", ink: "var(--color-ink-900)" },
  merged: { dot: "var(--color-brand-500)", ink: "var(--color-ink-900)" },
  status: { dot: "var(--color-brand-500)", ink: "var(--color-ink-900)" },
  quarantined: { dot: "#B7791F", ink: "var(--color-ink-900)" },
  duplicate: { dot: "#8A5FD1", ink: "var(--color-ink-900)" },
};

export function buildReportTimeline(
  report: Pick<MyReportDetail, "created_at" | "is_merged" | "member_count" | "moderation_status" | "moderated_at" | "ticket_created_at">,
  history: StatusHistoryStep[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "submitted",
      kind: "submitted",
      label: "Report submitted",
      detail: report.is_merged ? undefined : "Received and queued for review.",
      timestamp: report.created_at,
    },
  ];

  if (report.is_merged) {
    events.push({
      key: "merged",
      kind: "merged",
      label: "Merged with an existing issue",
      detail: `Grouped with ${report.member_count - 1} other report${report.member_count - 1 === 1 ? "" : "s"} on this ticket.`,
      timestamp: report.created_at,
    });
  }

  // status_history only gets a row once an admin advances the ticket past
  // its initial state — synthesize the starting "Reported" node from the
  // ticket's own creation time, same as the old StatusTimeline did. Skipped
  // for the original reporter, since it would land at the same instant as
  // "Report submitted" above and repeat the same information.
  if (report.is_merged) {
    events.push({
      key: "ticket-reported",
      kind: "status",
      label: STATUS_LABEL.Reported,
      timestamp: report.ticket_created_at,
    });
  }

  for (const step of history) {
    events.push({
      key: `status-${step.status}-${step.changed_at}`,
      kind: "status",
      label: STATUS_LABEL[step.status] ?? step.status,
      timestamp: step.changed_at,
      adminName: step.admin_name,
    });
  }

  if (report.moderation_status === "quarantined" && report.moderated_at) {
    events.push({
      key: "quarantined",
      kind: "quarantined",
      label: "Under additional review",
      detail: "Needs another look before it appears on the public map. This does not affect your ticket's progress.",
      timestamp: report.moderated_at,
    });
  } else if (report.moderation_status === "duplicate" && report.moderated_at) {
    events.push({
      key: "duplicate",
      kind: "duplicate",
      label: "Marked as duplicate",
      detail: "Matched a report already on file, so it won't be shown separately.",
      timestamp: report.moderated_at,
    });
  }

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export default function ReportTimeline({
  report,
  history,
}: {
  report: Pick<MyReportDetail, "created_at" | "is_merged" | "member_count" | "moderation_status" | "moderated_at" | "ticket_created_at">;
  history: StatusHistoryStep[];
}) {
  const events = buildReportTimeline(report, history);

  return (
    <ol className="flex flex-col gap-0" aria-label="Report timeline">
      {events.map((event, i) => {
        const style = KIND_STYLE[event.kind];
        return (
          <li key={event.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="mt-1 size-2.5 flex-shrink-0 rounded-full"
                style={{ background: style.dot }}
                aria-hidden="true"
              />
              {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-line-200" style={{ minHeight: "1.5rem" }} />}
            </div>
            <div className="min-w-0 pb-4">
              <p className="text-[14px] font-semibold" style={{ color: style.ink }}>
                {event.label}
              </p>
              {event.detail && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-500">{event.detail}</p>}
              <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-400">
                {new Date(event.timestamp).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {event.adminName ? ` · ${event.adminName}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
