"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import type { BarangayTrendRow } from "@/lib/types/admin-barangay-insights";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

const trendChartConfig = { tickets: { label: "New tickets", color: "var(--color-brand-500)" } } satisfies ChartConfig;

function formatShortDate(value: string): string {
  const date = new Date(value + "T00:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(value: string): string {
  const date = new Date(value + "T00:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { date: string; tickets: number } }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="grid min-w-40 gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">{formatLongDate(row.date)}</p>
      <div className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>New tickets</span>
        <strong className="font-mono text-sm text-foreground">{row.tickets.toLocaleString()}</strong>
      </div>
    </div>
  );
}

// 30-day fixed window, no range toggle — this is a barangay-level profile,
// not a second dashboard; DashboardClient already owns the 7/30/90 control
// for city/office-wide trends.
export function BarangayTrendChart({ data }: { data: BarangayTrendRow[] }) {
  const trend = data.map((row) => ({ date: row.date, tickets: row.ticket_count }));
  return (
    <ChartContainer
      aria-label="New tickets over the last 30 days"
      className="h-56 min-h-56 w-full"
      config={trendChartConfig}
      role="img"
    >
      <AreaChart accessibilityLayer data={trend} margin={{ left: 8, right: 8 }}>
        <defs>
          <linearGradient id="barangay-trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-tickets)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-tickets)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis axisLine={false} dataKey="date" minTickGap={28} tickFormatter={formatShortDate} tickLine={false} tickMargin={8} />
        <ChartTooltip content={<TrendTooltip />} cursor={{ stroke: "var(--color-tickets)", strokeDasharray: "3 3", strokeLinecap: "round" }} wrapperStyle={{ outline: "none" }} />
        <Area
          dataKey="tickets"
          dot={{ fill: "var(--color-tickets)", r: 2.5, strokeWidth: 2 }}
          fill="url(#barangay-trend-fill)"
          isAnimationActive={false}
          name="New tickets"
          stroke="var(--color-tickets)"
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
