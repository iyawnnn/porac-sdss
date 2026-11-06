import type { OfficePerformanceCounts, OfficePerformanceSummary as OfficePerformanceSummaryData } from "@/lib/types/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CardBodyPanel } from "../shared/CardBodyPanel";

const METRICS: { key: keyof OfficePerformanceCounts; label: string }[] = [
  { key: "pendingWorkOrders", label: "Pending Work Orders" },
  { key: "inProgressWorkOrders", label: "In Progress Work Orders" },
  { key: "overdueWorkOrders", label: "Overdue Work Orders" },
  { key: "completedWorkOrdersThisWeek", label: "Completed This Week" },
  { key: "flaggedReportsPending", label: "Flagged Reports Pending" },
];

function MetricTile({ counts, metric }: { counts: OfficePerformanceCounts; metric: (typeof METRICS)[number] }) {
  return (
    <div className="rounded-lg border border-line-100 p-3">
      <p className="font-mono text-xl font-semibold tabular-nums">{counts[metric.key].toLocaleString()}</p>
      <p className="truncate text-xs text-muted-foreground" title={metric.label}>{metric.label}</p>
    </div>
  );
}

export function OfficePerformanceSummary({ summary }: { summary: OfficePerformanceSummaryData }) {
  // Deliberately worded differently from the sidebar footer's "My Office: X"
  // / "All Offices" text (AdminSidebar.tsx) — same information, but a
  // distinct string so the two don't collide under Playwright's
  // substring-matching getByText in the same page.
  const scopeLabel = `${summary.scope} office summary`;
  return (
    <Card aria-label="Office performance summary" className="gap-0 rounded-xl bg-muted pt-2 pb-5" role="region">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">Office Performance Summary</CardTitle>
        <Badge variant="secondary">{scopeLabel}</Badge>
      </CardHeader>
      <CardBodyPanel className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {METRICS.map((metric) => <MetricTile counts={summary} key={metric.key} metric={metric} />)}
        </div>
      </CardBodyPanel>
    </Card>
  );
}
