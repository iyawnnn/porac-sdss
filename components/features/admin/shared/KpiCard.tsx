import { ArrowDownRight, ArrowUpRight, Ticket } from "lucide-react";
import { Area, AreaChart } from "recharts";
import type { KpiDelta } from "@/lib/types/admin-dashboard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CardBodyPanel } from "./CardBodyPanel";
import { CardHeaderRow } from "./CardHeaderRow";

// KPI sparklines share one series key ("value") so the three cards can feed
// KpiCard from differently-named API fields without three near-identical
// configs — the label is generic because each card's own heading names it.
const sparklineChartConfig = { value: { label: "Recent trend", color: "var(--chart-bar-peak)" } } satisfies ChartConfig;

// Week-over-week delta shown beside each headline number.
//
// Colored purely by the sign of the change: up is green, down is red, on
// every card. This is a deliberate reversal of an earlier revision that
// colored by judgement (a rise in Active Tickets or Pending Work Orders
// rendered red, on the grounds that a growing hazard backlog is bad news).
// It was changed on request. The consequence is intended and worth knowing
// when reading these cards: a growing backlog now reads green.
//
// Never color-only (docs/design-system.md anti-patterns): the arrow glyph
// and the signed number both carry the direction independently of hue.
// `stacked` drops the "vs last week" qualifier onto its own line beneath the
// figure, which is the KPI cards' arrangement. The Incident Reports card
// keeps the default inline reading, where the indicator sits beside the range
// total in a single row and a two-line block would misalign against it — so
// this stays a variant rather than a change to every caller.
export function DeltaIndicator({ delta, stacked = false }: { delta: KpiDelta | null | undefined; stacked?: boolean }) {
  const qualifier = <span className={stacked ? "block font-normal text-muted-foreground" : "font-normal text-muted-foreground"}>{stacked ? "vs last week" : " vs last week"}</span>;

  // A missing delta is a real state, not an error — Pending Work Orders has
  // no honest baseline until work_order_status_history reaches back a week
  // (see getKpiDeltas). Show a dash, never a fabricated 0%.
  if (!delta) return <span className="shrink-0 text-xs text-muted-foreground" title="Not enough history to compare yet">{stacked ? <>—{qualifier}</> : <>— vs last week</>}</span>;

  const { changeAbs, changePct } = delta;
  const rising = changeAbs > 0;
  const flat = changeAbs === 0;
  const tone = flat ? "var(--delta-flat)" : rising ? "var(--delta-up)" : "var(--delta-down)";
  // changePct is null when the baseline was 0 — "+infinity%" helps nobody,
  // so fall back to the absolute change, which is always well defined.
  const magnitude = changePct === null
    ? `${rising ? "+" : ""}${changeAbs.toLocaleString()}`
    : `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`;
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;

  // Stacked keeps the arrow+figure on their own flex row so the tone color
  // stays scoped to them; the qualifier below is always muted, never tinted,
  // because it is a constant label and not part of the signal.
  if (stacked) {
    return (
      <span className="shrink-0 text-xs font-medium tabular-nums">
        <span className="flex items-center gap-0.5" style={{ color: tone }}>
          {!flat && <Arrow aria-hidden="true" className="size-3.5 shrink-0" />}
          {magnitude}
        </span>
        {qualifier}
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium tabular-nums" style={{ color: tone }}>
      {!flat && <Arrow aria-hidden="true" className="size-3.5 shrink-0" />}
      {magnitude}
      {qualifier}
    </span>
  );
}

// The header icon is --brand (#ff7a00, the guidelines' orange) rather than
// --brand-solid. It is aria-hidden and sits beside a visible text label, so
// it is decorative and outside WCAG 1.4.11 — which is what lets it use the
// 2.61:1 brand orange instead of the deepened AA-safe shade. Any icon that
// ever becomes the sole carrier of meaning has to move to --brand-solid.
export function KpiCard({ label, value, icon: Icon, sparkline, delta }: { label: string; value: string; icon: typeof Ticket; sparkline?: { date: string; value: number }[]; delta?: KpiDelta | null }) {
  return (
    <Card className="gap-0 rounded-xl bg-muted pt-2 pb-5">
      <CardHeader className="px-4 pb-2">
        <CardHeaderRow>
          <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
          <Icon aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
        </CardHeaderRow>
      </CardHeader>
      <CardBodyPanel className="flex items-end justify-between gap-3 px-4 pt-3 pb-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[28px] leading-8 font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
          <DeltaIndicator delta={delta} stacked />
        </div>
        {sparkline && sparkline.length > 0 && (
          <ChartContainer className="h-9 w-24 shrink-0" config={sparklineChartConfig}>
            <AreaChart data={sparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area dataKey="value" dot={false} fill="var(--chart-bar-peak)" fillOpacity={0.08} isAnimationActive={false} stroke="var(--chart-bar-peak)" strokeWidth={1.5} type="monotone" />
            </AreaChart>
          </ChartContainer>
        )}
      </CardBodyPanel>
    </Card>
  );
}
