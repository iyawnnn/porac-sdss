"use client";

import type { ChartConfig } from "@/components/ui/chart";
import { DistributionDonutChart } from "./DistributionDonutChart";
import type { DistributionChartItem } from "./DistributionChartUtils";

/** The workflow has only MEO and MDRRMO; show their assigned workload as one part-to-whole chart. */
export function DepartmentWorkloadComparison({ ariaLabel, description, items, config }: { ariaLabel: string; description: string; items: DistributionChartItem[]; config: ChartConfig }) {
  return <DistributionDonutChart ariaLabel={ariaLabel} centerLabel="Active" config={config} description={description} items={items.filter((item) => item.key === "meo" || item.key === "mdrrmo")} size="large" />;
}
