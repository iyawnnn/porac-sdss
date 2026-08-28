import type { OfficePerformanceCounts, OfficePerformanceSummary as OfficePerformanceSummaryData } from "@/lib/types/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardBodyPanel } from "../shared/CardBodyPanel";

const METRICS: { key: keyof OfficePerformanceCounts; label: string }[] = [
  { key: "pendingWorkOrders", label: "Pending Work Orders" },
  { key: "inProgressWorkOrders", label: "In Progress Work Orders" },
  { key: "overdueWorkOrders", label: "Overdue Work Orders" },
  { key: "completedWorkOrdersThisWeek", label: "Completed This Week" },
  { key: "highUrgencyOpenTickets", label: "High-Urgency Open Tickets" },
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

function ComparisonTable({ byOffice }: { byOffice: NonNullable<OfficePerformanceSummaryData["byOffice"]> }) {
  return (
    <Table className="mt-1">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-0">Office</TableHead>
          {METRICS.map((metric) => <TableHead className="text-end" key={metric.key}>{metric.label}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(["MEO", "MDRRMO"] as const).map((office) => (
          <TableRow className="hover:bg-transparent" key={office}>
            <TableCell className="pl-0 font-medium">{office}</TableCell>
            {METRICS.map((metric) => (
              <TableCell className="text-end font-mono text-xs tabular-nums text-muted-foreground" key={metric.key}>
                {byOffice[office][metric.key].toLocaleString()}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OfficePerformanceSummary({ summary }: { summary: OfficePerformanceSummaryData }) {
  // Deliberately worded differently from the sidebar footer's "My Office: X"
  // / "All Offices" text (AdminSidebar.tsx) — same information, but a
  // distinct string so the two don't collide under Playwright's
  // substring-matching getByText in the same page.
  const scopeLabel = summary.scope === "ALL" ? "City-wide summary" : `${summary.scope} office summary`;
  return (
    <Card aria-label="Office performance summary" className="gap-0 rounded-xl bg-muted pt-2 pb-5" role="region">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">Office Performance Summary</CardTitle>
        <Badge variant="secondary">{scopeLabel}</Badge>
      </CardHeader>
      <CardBodyPanel className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {METRICS.map((metric) => <MetricTile counts={summary} key={metric.key} metric={metric} />)}
        </div>
        {summary.byOffice && (
          <div className="overflow-x-auto border-t pt-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">MEO vs. MDRRMO</p>
            <ComparisonTable byOffice={summary.byOffice} />
          </div>
        )}
      </CardBodyPanel>
    </Card>
  );
}
