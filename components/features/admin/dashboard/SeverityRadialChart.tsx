"use client";

import { Label, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DistributionLegend, distributionDescription, formatDistributionPercent, normalizeDistribution, type DistributionChartItem } from "./DistributionChartUtils";

type CenterViewBox = { cx?: number; cy?: number };
function Center({ total, viewBox }: { total: number; viewBox?: CenterViewBox }) { if (viewBox?.cx === undefined || viewBox.cy === undefined) return null; return <text textAnchor="middle" x={viewBox.cx} y={viewBox.cy}><tspan className="fill-foreground font-mono text-2xl font-semibold tabular-nums" x={viewBox.cx} y={viewBox.cy - 4}>{total.toLocaleString()}</tspan><tspan className="fill-muted-foreground text-[11px]" x={viewBox.cx} y={viewBox.cy + 15}>Reports</tspan></text>; }

export function SeverityRadialChart({ ariaLabel, description, items, config }: { ariaLabel: string; description: string; items: DistributionChartItem[]; config: ChartConfig }) {
  const rows = normalizeDistribution(items, config); const total = rows.reduce((sum, item) => sum + item.count, 0); const hasData = total > 0;
  const chartData = hasData ? rows : [{ key: "empty", label: "No reports", count: 1, fill: "var(--muted)" }];
  const descriptionId = "radial-description-" + ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-4 py-4" data-chart-kind="radial-bar" data-testid="severity-radial-chart"><p className="sr-only" id={descriptionId}>{distributionDescription(description, rows, total)}</p><div className="flex min-w-0 flex-col items-center gap-4 @sm:flex-row @sm:justify-center"><ChartContainer aria-describedby={descriptionId} aria-label={ariaLabel} className="size-48 min-h-48 shrink-0 @sm:size-52 @sm:min-h-52" config={config} role="img"><RadialBarChart accessibilityLayer barCategoryGap="14%" data={chartData} endAngle={-270} innerRadius="24%" outerRadius="92%" startAngle={90}><ChartTooltip content={hasData ? <ChartTooltipContent hideLabel nameKey="label" formatter={(_value, _name, item) => { const row = item.payload as (typeof rows)[number]; return <div className="flex w-full items-center justify-between gap-4"><span className="text-muted-foreground">{row.label}</span><span className="font-mono font-medium tabular-nums text-foreground">{row.count.toLocaleString()} ({formatDistributionPercent(row.count, total)})</span></div>; }} /> : undefined} cursor={false} /><RadialBar background={{ fill: "var(--muted)" }} cornerRadius={4} dataKey="count" isAnimationActive={false} /><Label content={(props) => <Center total={total} viewBox={props.viewBox as CenterViewBox | undefined} />} position="center" /></RadialBarChart></ChartContainer><DistributionLegend ariaLabel={ariaLabel} items={rows} total={total} /></div></div>;
}
