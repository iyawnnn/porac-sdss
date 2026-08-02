import type { ChartConfig } from "@/components/ui/chart";

export type DistributionChartItem = {
  key: string;
  label: string;
  count: number | string | null | undefined;
};

export type NormalizedDistributionItem = {
  key: string;
  label: string;
  count: number;
  fill: string;
};

export function safeChartNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatDistributionPercent(count: number, total: number): string {
  if (total <= 0) return "0%";
  const percent = Math.round((count / total) * 1000) / 10;
  return Number.isInteger(percent) ? percent.toFixed(0) + "%" : percent.toFixed(1) + "%";
}

export function normalizeDistribution(items: DistributionChartItem[], config?: ChartConfig): NormalizedDistributionItem[] {
  return items.map((item) => ({ ...item, count: safeChartNumber(item.count), fill: config?.[item.key]?.color ?? "var(--color-" + item.key + ")" }));
}

export function DistributionLegend({ ariaLabel, items, total }: { ariaLabel: string; items: NormalizedDistributionItem[]; total: number }) {
  return <ul aria-label={ariaLabel + " legend"} className="grid min-w-0 gap-1.5">
    {items.map((item) => <li className="flex min-h-5 min-w-0 items-center gap-2 text-xs" key={item.key}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" data-testid={"legend-swatch-" + item.key} style={{ backgroundColor: item.fill }} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{item.count.toLocaleString()}</span>
      <span className="w-10 shrink-0 text-end tabular-nums text-muted-foreground">{formatDistributionPercent(item.count, total)}</span>
    </li>)}
  </ul>;
}

export function distributionDescription(description: string, items: NormalizedDistributionItem[], total: number) {
  return description + " Total: " + total.toLocaleString() + ". " + items.map((item) => item.label + ": " + item.count.toLocaleString() + ", " + formatDistributionPercent(item.count, total)).join(". ") + ".";
}

