import { riskBand } from "@/lib/utils/flag-risk";

const BAND_COLOR: Record<string, string> = {
  low: "#64748b",
  medium: "#f59e0b",
  high: "#f43f5e",
};

// Signature element of this page: one compact gauge standing in for the
// flag list, reused at list density and detail density.
export function RiskMeter({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const band = riskBand(score);
  const color = BAND_COLOR[band];
  const height = size === "lg" ? "h-2" : "h-1.5";
  const width = size === "lg" ? "w-28" : "w-16";

  return (
    <div className="flex items-center gap-2">
      <div className={`${width} ${height} rounded-full bg-slate-200 overflow-hidden`}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {score}%
      </span>
    </div>
  );
}
