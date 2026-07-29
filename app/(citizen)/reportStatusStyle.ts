export const REPORT_STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  Reported: { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" },
  "Under Review": { tint: "#EFF5FC", ink: "#1A4570", dot: "#2B6CB0" },
  "In Progress": { tint: "#D8E6F7", ink: "#102943", dot: "#22578E" },
  Resolved: { tint: "#E3F5EE", ink: "#0B5741", dot: "#0F7A5A" },
  Rejected: { tint: "#FDEAEA", ink: "#8A1D12", dot: "#B42318" },
};

export const REPORT_STATUS_FALLBACK = { tint: "#F1F3F5", ink: "#434B54", dot: "#98A2AC" };
