import type { MyReportDetail, MyReportRow } from "@/lib/types/citizens-reports";

// Single source of truth for citizen-facing report/ticket status copy — the
// list page, detail page, and timeline all read from here instead of each
// re-deriving their own text, so a wording change never has to be repeated
// in three places. Moderation copy is deliberately kept word-for-word
// identical to the notification text in api/src/admin/moderation.service.ts
// (requirement: notification wording must match what the page shows).

export function officeLabel(office: "MEO" | "MDRRMO"): string {
  return office === "MEO" ? "Municipal Engineering Office" : "Municipal Disaster Risk Reduction Office";
}

const STATUS_COPY: Record<string, { subtitle: string; update: string }> = {
  Reported: {
    subtitle: "Awaiting staff review",
    update: "Your report has been logged and is waiting for formal review.",
  },
  "Under Review": {
    subtitle: "Being reviewed by city staff",
    update: "City staff are currently reviewing your submitted report.",
  },
  "In Progress": {
    subtitle: "Work is currently ongoing",
    update: "Your report is being actively worked on by the assigned office.",
  },
  Resolved: {
    subtitle: "This report has been resolved",
    update: "Your report has been marked resolved by city staff.",
  },
  Rejected: {
    subtitle: "This report was not accepted",
    update: "This report was reviewed and was not accepted for action.",
  },
};
const FALLBACK_STATUS_COPY = { subtitle: "", update: "" };

export function statusCopy(status: string): { subtitle: string; update: string } {
  return STATUS_COPY[status] ?? FALLBACK_STATUS_COPY;
}

// Mirrors moderation.service.ts's `report_quarantined` notification exactly.
export function quarantinedCopy(title: string): { title: string; message: string } {
  return {
    title: "Report under additional review",
    message: `"${title}" needs another look before it appears on the public map. This does not affect your ticket's progress.`,
  };
}

// Mirrors moderation.service.ts's `report_flagged_duplicate` notification exactly.
export function duplicateCopy(title: string): { title: string; message: string } {
  return {
    title: "Report matched an existing submission",
    message: `The photo on "${title}" matched a report already on file, so it won't be shown separately.`,
  };
}

// Mirrors the `report_merged` notification's "grouped with N other reports" phrasing.
export function mergedCopy(memberCount: number): string {
  const others = memberCount - 1;
  return `Your report was merged with an existing issue already reported by ${others} other resident${others === 1 ? "" : "s"}. It's now being tracked together as one ticket.`;
}

export function othersJoinedCopy(memberCount: number): string {
  const others = memberCount - 1;
  return `${others} other resident${others === 1 ? "" : "s"} ${others === 1 ? "has" : "have"} also reported this issue. It's being tracked together as one ticket.`;
}

// One-line summary for list-density cards — the single most relevant thing
// to tell a citizen about this report right now, in priority order:
// moderation outcome > merge direction > current ticket status.
export function latestUpdateLine(report: Pick<MyReportRow, "title" | "status" | "moderation_status" | "member_count" | "is_merged">): string {
  if (report.moderation_status === "quarantined") return quarantinedCopy(report.title).message;
  if (report.moderation_status === "duplicate") return duplicateCopy(report.title).message;
  if (report.is_merged) return mergedCopy(report.member_count);
  if (report.member_count > 1) return othersJoinedCopy(report.member_count);
  return statusCopy(report.status).update;
}

export function resolvedUpdateLine(report: Pick<MyReportDetail, "status" | "resolution_notes">): string | null {
  if (report.status !== "Resolved") return null;
  return report.resolution_notes?.trim() ? report.resolution_notes : statusCopy(report.status).update;
}
