import { AlertTriangle, CheckCircle2, Clock, Flame, Inbox, ShieldAlert, type LucideIcon } from "lucide-react";
import type { OfficePerformanceCounts, OfficePerformanceSummary as OfficePerformanceSummaryData } from "@/lib/types/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const METRICS: { key: keyof OfficePerformanceCounts; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "pendingWorkOrders", label: "Pending Work Orders", icon: Inbox, tint: "bg-slate-100 text-slate-600" },
  { key: "inProgressWorkOrders", label: "In Progress Work Orders", icon: Clock, tint: "bg-blue-50 text-blue-600" },
  { key: "overdueWorkOrders", label: "Overdue Work Orders", icon: AlertTriangle, tint: "bg-red-50 text-red-600" },
  { key: "completedWorkOrdersThisWeek", label: "Completed This Week", icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600" },
  { key: "highUrgencyOpenTickets", label: "High-Urgency Open Tickets", icon: Flame, tint: "bg-amber-50 text-amber-600" },
  { key: "flaggedReportsPending", label: "Flagged Reports Pending", icon: ShieldAlert, tint: "bg-purple-50 text-purple-600" },
];

function MetricTile({ counts, metric }: { counts: OfficePerformanceCounts; metric: (typeof METRICS)[number] }) {
  const Icon = metric.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-100 p-3">
      <div className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + metric.tint}>
        <Icon aria-hidden="true" className="size-4.5" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="font-mono text-xl font-semibold tabular-nums">{counts[metric.key].toLocaleString()}</p>
        <p className="truncate text-xs text-muted-foreground" title={metric.label}>{metric.label}</p>
      </div>
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
    <Card aria-label="Office performance summary" className="lg:col-span-2 dashboard:col-span-4" role="region">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Office Performance Summary</CardTitle>
        <Badge variant="secondary">{scopeLabel}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {METRICS.map((metric) => <MetricTile counts={summary} key={metric.key} metric={metric} />)}
        </div>
        {summary.byOffice && (
          <div className="overflow-x-auto border-t pt-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">MEO vs. MDRRMO</p>
            <ComparisonTable byOffice={summary.byOffice} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
