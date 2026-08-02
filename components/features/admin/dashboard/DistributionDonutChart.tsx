"use client";

import { Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { DistributionLegend, distributionDescription, formatDistributionPercent, normalizeDistribution, type DistributionChartItem } from "./DistributionChartUtils";

export type DistributionDonutItem = DistributionChartItem;
export { formatDistributionPercent } from "./DistributionChartUtils";

type DonutCenterViewBox = { cx?: number; cy?: number };

function DonutCenter({ total, label, viewBox }: { total: number; label: string; viewBox?: DonutCenterViewBox }) {
  if (viewBox?.cx === undefined || viewBox.cy === undefined) return null;
  return <text textAnchor="middle" x={viewBox.cx} y={viewBox.cy}><tspan className="fill-foreground font-mono text-2xl font-semibold tabular-nums" x={viewBox.cx} y={viewBox.cy - 4}>{total.toLocaleString()}</tspan><tspan className="fill-muted-foreground text-[11px]" x={viewBox.cx} y={viewBox.cy + 15}>{label}</tspan></text>;
}

export function DistributionDonutChart({ ariaLabel, description, items, config, centerLabel = "Total", className, size = "default" }: { ariaLabel: string; description: string; items: DistributionDonutItem[]; config: ChartConfig; centerLabel?: string; className?: string; size?: "compact" | "default" | "large" }) {
  const rows = normalizeDistribution(items, config);
  const total = rows.reduce((sum, item) => sum + item.count, 0);
  const chartData = rows.filter((item) => item.count > 0);
  const hasData = chartData.length > 0;
  const pieData = hasData ? chartData : [{ key: "empty", label: "No data", count: 1, fill: "var(--muted)" }];
  const descriptionId = "donut-description-" + ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const chartSize = size === "compact" ? "size-32 min-h-32 @sm:size-36 @sm:min-h-36" : size === "large" ? "size-56 min-h-56 @sm:size-60 @sm:min-h-60" : "size-48 min-h-48 shrink-0 @sm:size-52 @sm:min-h-52";
  const bodySpacing = size === "compact" ? "gap-2 px-4 py-3" : "gap-3 px-4 py-4";
  return <div className={cn("flex min-h-0 flex-1 flex-col justify-center", bodySpacing, className)} data-chart-kind="donut" data-testid="distribution-donut">
    <p className="sr-only" id={descriptionId}>{distributionDescription(description, rows, total)}</p><span className="sr-only" data-testid="donut-center-summary">{total.toLocaleString()} {centerLabel}</span>
    <div className={cn("flex min-w-0 flex-col items-center @sm:flex-row @sm:justify-center", size === "compact" ? "gap-2" : "gap-4")}>
      <ChartContainer aria-describedby={descriptionId} aria-label={ariaLabel} className={chartSize} config={config} role="img">
        <PieChart accessibilityLayer><ChartTooltip content={hasData ? <ChartTooltipContent hideLabel nameKey="label" formatter={(value, _name, item) => { const row = item.payload as (typeof rows)[number]; return <div className="flex w-full items-center justify-between gap-4"><span className="text-muted-foreground">{row.label}</span><span className="font-mono font-medium tabular-nums text-foreground">{row.count.toLocaleString()} ({formatDistributionPercent(row.count, total)})</span></div>; }} /> : undefined} cursor={false} /><Pie data={pieData} dataKey="count" innerRadius="62%" nameKey="label" outerRadius="90%" paddingAngle={hasData ? 2 : 0} isAnimationActive={false} stroke="var(--card)"><Label content={(props) => <DonutCenter label={centerLabel} total={total} viewBox={props.viewBox as DonutCenterViewBox | undefined} />} position="center" /></Pie></PieChart>
      </ChartContainer>
      <DistributionLegend ariaLabel={ariaLabel} items={rows} total={total} />
    </div>
  </div>;
}
