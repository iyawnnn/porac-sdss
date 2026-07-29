import type { ModerationStats } from "@/lib/admin/moderation";

const CARDS: {
  key: keyof ModerationStats;
  label: string;
  accent: string;
  glow: string;
  format: (stats: ModerationStats) => string;
}[] = [
  {
    key: "pending",
    label: "Pending review",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.18)",
    format: (s) => String(s.pending),
  },
  {
    key: "quarantined",
    label: "Auto-quarantined",
    accent: "#f43f5e",
    glow: "rgba(244,63,94,0.18)",
    format: (s) => String(s.quarantined),
  },
  {
    key: "dismissed",
    label: "Dismissed / clean",
    accent: "#10b981",
    glow: "rgba(16,185,129,0.18)",
    format: (s) => String(s.dismissed),
  },
  {
    key: "avgResolutionHours",
    label: "Avg. resolution time",
    accent: "#6366f1",
    glow: "rgba(99,102,241,0.18)",
    format: (s) => (s.avgResolutionHours == null ? "—" : `${s.avgResolutionHours.toFixed(1)}h`),
  },
];

// Glass treatment kept scoped to this KPI strip, matching the precedent set
// by the admin map's floating controls (MapControls.tsx) rather than
// introduced as a new global pattern — see DESIGN.md re: flat admin chrome.
export function KpiBar({ stats }: { stats: ModerationStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-xl border border-slate-200/60 bg-white/90 p-4 shadow-xl backdrop-blur-md"
          style={{ boxShadow: `0 8px 24px -8px ${card.glow}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums" style={{ color: card.accent }}>
            {card.format(stats)}
          </p>
        </div>
      ))}
    </div>
  );
}
