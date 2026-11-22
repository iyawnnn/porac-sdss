export const REPORT_STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: { tint: "var(--color-status-reported-tint)", ink: "var(--color-status-reported-ink)", dot: "var(--color-status-reported-dot)" },
  "Under Review": { tint: "var(--color-status-under-review-tint)", ink: "var(--color-status-under-review-ink)", dot: "var(--color-status-under-review-dot)" },
  "In Progress": { tint: "var(--color-status-in-progress-tint)", ink: "var(--color-status-in-progress-ink)", dot: "var(--color-status-in-progress-dot)" },
  Resolved: { tint: "var(--color-status-resolved-tint)", ink: "var(--color-status-resolved-ink)", dot: "var(--color-status-resolved-dot)" },
  Rejected: { tint: "var(--color-status-rejected-tint)", ink: "var(--color-status-rejected-ink)", dot: "var(--color-status-rejected-dot)" },
};

export const REPORT_STATUS_FALLBACK = { tint: "var(--color-status-reported-tint)", ink: "var(--color-status-reported-ink)", dot: "var(--color-status-reported-dot)" };
