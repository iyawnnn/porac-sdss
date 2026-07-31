export const TICKET_STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570", dot: "#2B6CB0" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943", dot: "#22578E" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741", dot: "#0F7A5A" },
  Rejected: { tint: "#FDEAEA", ink: "#8A1D12", dot: "#B42318" },
};
const FALLBACK_STATUS_STYLE = { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" };

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
