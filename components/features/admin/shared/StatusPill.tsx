// Values are `var(--color-status-*)` references, not hex, so the five status
// palettes have exactly one definition (app/globals.css's @theme block).
// These were hand-copied hex before, and Under Review / In Progress were
// borrowed straight from the retiring --color-brand-* blue ramp — the exact
// "same meaning defined in several places" drift docs/design-system.md §1
// calls out. No hue changed in this move; ticket-status colors are still the
// approval-gated TBD in §3.2.
//
// The shape stays { tint, ink, dot } of plain strings rather than Tailwind
// class names because HorizontalStatusTracker consumes `.ink` as an inline
// `background` value — a CSS var() resolves there, a class name would not.
export const TICKET_STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: {
    tint: "var(--color-status-reported-tint)",
    ink: "var(--color-status-reported-ink)",
    dot: "var(--color-status-reported-dot)",
  },
  "Under Review": {
    tint: "var(--color-status-under-review-tint)",
    ink: "var(--color-status-under-review-ink)",
    dot: "var(--color-status-under-review-dot)",
  },
  "In Progress": {
    tint: "var(--color-status-in-progress-tint)",
    ink: "var(--color-status-in-progress-ink)",
    dot: "var(--color-status-in-progress-dot)",
  },
  Resolved: {
    tint: "var(--color-status-resolved-tint)",
    ink: "var(--color-status-resolved-ink)",
    dot: "var(--color-status-resolved-dot)",
  },
  Rejected: {
    tint: "var(--color-status-rejected-tint)",
    ink: "var(--color-status-rejected-ink)",
    dot: "var(--color-status-rejected-dot)",
  },
};
// An unrecognized status renders as Reported's neutral grey rather than
// unstyled — a status value outside the enum is a data problem, not a
// reason to drop the pill.
const FALLBACK_STATUS_STYLE = TICKET_STATUS_STYLE.Reported;

export function StatusPill({ status, size = "sm" }: { status: string; size?: "sm" | "lg" }) {
  const style = TICKET_STATUS_STYLE[status] ?? FALLBACK_STATUS_STYLE;
  const padding = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding}`}
      style={{ background: style.tint, color: style.ink }}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: style.dot }} aria-hidden="true" />
      {status}
    </span>
  );
}
