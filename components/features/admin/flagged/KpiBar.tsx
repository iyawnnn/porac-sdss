import { AlertTriangle, Ban, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { ModerationStats } from "@/lib/types/admin-moderation";
import { Card, CardContent } from "@/components/ui/card";

const CARDS: {
  key: keyof ModerationStats;
  label: string;
  icon: LucideIcon;
  tint: string;
  format: (stats: ModerationStats) => string;
}[] = [
  { key: "pending", label: "Pending Review", icon: AlertTriangle, tint: "bg-amber-50 text-amber-600", format: (s) => String(s.pending) },
  { key: "quarantined", label: "Quarantined", icon: Ban, tint: "bg-rose-50 text-rose-600", format: (s) => String(s.quarantined) },
  { key: "dismissed", label: "Dismissed", icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600", format: (s) => String(s.dismissed) },
  { key: "avgResolutionHours", label: "Avg. Resolution Time", icon: Clock, tint: "bg-blue-50 text-blue-600", format: (s) => (s.avgResolutionHours == null ? "—" : `${s.avgResolutionHours.toFixed(1)}h`) },
];

// Flat, bordered KpiCard — matches TicketsWorkspace.tsx's KpiCard exactly
// (no glass, no shadow beyond shadcn Card's default xs). The previous
// glassmorphism treatment here was a one-off, not an established pattern.
export function KpiBar({ stats }: { stats: ModerationStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map((card) => (
        <Card className="py-0 shadow-xs" key={card.key}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.tint}`}>
              <card.icon aria-hidden="true" className="size-4.5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="font-mono text-2xl font-semibold tabular-nums">{card.format(stats)}</p>
              <p className="truncate text-xs text-muted-foreground" title={card.label}>{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
