"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Flame, Map as MapIcon, ShieldAlert, ShieldUser, Ticket, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_RANGES,
  type BarangayRiskRow,
  type CategoryDistributionRow,
  type DashboardKpis,
  type DashboardRange,
  type DistributionRow,
  type IncidentTrendRow,
} from "@/lib/types/admin-dashboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DistributionChartItem } from "./DistributionChartUtils";
import { DistributionDonutChart } from "./DistributionDonutChart";
import { SeverityRadialChart } from "./SeverityRadialChart";
import { DepartmentWorkloadComparison } from "./DepartmentWorkloadComparison";

const SEP = "\u00b7";
const ACTIVE_STATUS_ORDER = ["Reported", "Under Review", "In Progress"] as const;
const STATUS_ORDER = ["Reported", "Under Review", "In Progress", "Resolved", "Rejected"] as const;
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"] as const;
const DEPARTMENT_ORDER = ["MEO", "MDRRMO"] as const;
const trendChartConfig = { reports: { label: "Submitted reports", color: "var(--color-brand-500)" } } satisfies ChartConfig;
const statusChartConfig = {
  reported: { label: "Reported", color: "var(--color-lifecycle-reported)" },
  "under-review": { label: "Under Review", color: "var(--color-lifecycle-under-review)" },
  "in-progress": { label: "In Progress", color: "var(--color-lifecycle-in-progress)" },
  resolved: { label: "Resolved", color: "var(--color-lifecycle-resolved)" },
  rejected: { label: "Rejected", color: "var(--color-lifecycle-rejected)" },
} satisfies ChartConfig;
const severityChartConfig = {
  critical: { label: "Critical", color: "var(--color-severity-critical)" }, high: { label: "High", color: "var(--color-severity-high)" }, medium: { label: "Medium", color: "var(--color-severity-medium)" }, low: { label: "Low", color: "var(--color-severity-low)" },
} satisfies ChartConfig;
const departmentChartConfig = { meo: { label: "MEO", color: "var(--color-office-meo)" }, mdrrmo: { label: "MDRRMO", color: "var(--color-office-mdrrmo)" } } satisfies ChartConfig;

// departmentWorkload is null for office-scoped admins — it's the
// cross-office comparison, only meaningful for a System Administrator (see
// dashboard.controller.ts).
type DashboardData = { kpis: DashboardKpis; leaderboard: BarangayRiskRow[]; categories: CategoryDistributionRow[]; incidentTrend: IncidentTrendRow[]; statusDistribution: DistributionRow[]; departmentWorkload: DistributionRow[] | null; citizenSeverityDistribution: DistributionRow[]; range?: DashboardRange };

function numeric(value: number | string | null | undefined): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatHours(value: number | string | null | undefined): string { if (value === null || value === undefined || !Number.isFinite(Number(value))) return "\u2014"; const hours = numeric(value); if (hours < 1) return Math.round(hours * 60) + " min"; if (hours < 48) return hours.toFixed(1) + " hr"; return (hours / 24).toFixed(1) + " days"; }
function formatShortDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatLongDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
function chartKey(label: string) { return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function distributionItems(rows: DistributionRow[], labels: readonly string[]): DistributionChartItem[] { const counts = new Map(rows.map((row) => [row.label, numeric(row.count)])); return labels.map((label) => ({ key: chartKey(label), label, count: counts.get(label) ?? 0 })); }
function departmentItems(rows: DistributionRow[]): DistributionChartItem[] { return distributionItems(rows, DEPARTMENT_ORDER); }

function IncidentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { date: string; reports: number } }> }) { const row = payload?.[0]?.payload; if (!active || !row) return null; return <div data-testid="incident-chart-tooltip" className="grid min-w-44 gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl"><p className="font-medium">{formatLongDate(row.date)}</p><div className="flex items-center justify-between gap-4 text-muted-foreground"><span>Submitted reports</span><strong className="font-mono text-sm text-foreground">{numeric(row.reports).toLocaleString()}</strong></div></div>; }
function RangeControl({ range, isUpdating, onChange }: { range: DashboardRange; isUpdating: boolean; onChange: (range: DashboardRange) => void }) { return <ToggleGroup aria-label="Incident report date range" disabled={isUpdating} onValueChange={(value) => { const nextRange = Number(value); if (DASHBOARD_RANGES.includes(nextRange as DashboardRange)) onChange(nextRange as DashboardRange); }} size="sm" spacing={0} type="single" value={String(range)} variant="outline">{DASHBOARD_RANGES.map((days) => <ToggleGroupItem aria-label={"Last " + days + " Days"} key={days} value={String(days)}>Last {days} Days</ToggleGroupItem>)}</ToggleGroup>; }

function AnalyticsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card className="@container flex h-full flex-col"><CardHeader className="gap-1 border-b px-4 pt-3 pb-2"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="flex min-h-0 flex-1 p-0">{children}</CardContent></Card>; }

function QuickActions({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const actions: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/admin/tickets", label: isSystemAdmin ? "All Tickets" : "My Office Tickets", icon: Ticket },
    { href: "/admin/tickets?urgency=Critical", label: "High Urgency Tickets", icon: Flame },
    { href: "/admin/flagged", label: "Flagged Reports", icon: ShieldAlert },
    { href: "/admin/map", label: "GIS Map", icon: MapIcon },
  ];
  if (isSystemAdmin) actions.push({ href: "/admin/admins", label: "Manage Admins", icon: ShieldUser });
  return (
    <Card aria-label="Quick actions" className="lg:col-span-2 dashboard:col-span-4" role="region">
      <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button asChild key={action.href} size="sm" variant="outline">
              <Link href={action.href}><Icon />{action.label}</Link>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
function RankedTableCard({ kind, rows }: { kind: "barangay" | "category"; rows: BarangayRiskRow[] | CategoryDistributionRow[] }) { const isBarangay = kind === "barangay"; const tableRows = rows.slice(0, 5); return <Card className="flex h-full flex-col dashboard:col-span-2"><CardHeader className="gap-1"><CardTitle>{isBarangay ? "Barangay Activity" : "Category Distribution"}</CardTitle><CardDescription>{isBarangay ? "Top five barangays by active tickets and workflow priority." : "Top five hazard categories; share uses all active tickets."}</CardDescription></CardHeader><CardContent className="flex-1 p-0"><Table className="border-t"><TableCaption className="sr-only">{isBarangay ? "Top five barangays by active ticket count and workflow priority." : "Top five hazard categories by active ticket count; share is calculated across all active tickets."}</TableCaption><TableHeader><TableRow><TableHead className="pl-6" scope="col">{isBarangay ? "Barangay" : "Category"}</TableHead><TableHead className="text-end" scope="col">Active</TableHead><TableHead className="pr-6 text-end" scope="col">{isBarangay ? "Priority" : "Share"}</TableHead></TableRow></TableHeader><TableBody>{tableRows.map((raw) => { if (isBarangay) { const row = raw as BarangayRiskRow; return <TableRow className="hover:bg-transparent" key={row.barangay_id}><TableCell className="max-w-56 pl-6 font-medium"><Link className="block truncate" href={"/admin/tickets?barangayId=" + row.barangay_id + "&status=active"} title={row.barangay_name}>{row.barangay_name}</Link></TableCell><TableCell className="text-end text-xs tabular-nums text-muted-foreground">{numeric(row.active_count).toLocaleString()}</TableCell><TableCell className="pr-6 text-end text-xs tabular-nums text-muted-foreground">{row.avg_priority === null ? "\u2014" : numeric(row.avg_priority).toFixed(0)}</TableCell></TableRow>; } const row = raw as CategoryDistributionRow; const total = numeric(row.active_total); const share = total > 0 ? numeric(row.active_count) / total * 100 : 0; return <TableRow className="hover:bg-transparent" key={row.category}><TableCell className="max-w-56 pl-6 font-medium"><span className="block truncate" title={row.category}>{row.category}</span></TableCell><TableCell className="text-end text-xs tabular-nums text-muted-foreground">{numeric(row.active_count).toLocaleString()}</TableCell><TableCell className="pr-6 text-end text-xs tabular-nums text-muted-foreground">{Number.isInteger(share) ? share.toFixed(0) : share.toFixed(1)}%</TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>; }

export function DashboardClient({ initialData, isSystemAdmin }: { initialData: DashboardData; isSystemAdmin: boolean }) {
  const [data, setData] = useState(initialData); const [range, setRange] = useState<DashboardRange>(initialData.range ?? 30); const [isPending, startTransition] = useTransition(); const [rangeError, setRangeError] = useState<string | null>(null); const requestId = useRef(0); const gradientId = "incident-area-" + useId().replace(/:/g, "");
  const trend = data.incidentTrend.map((row) => ({ date: row.date, reports: numeric(row.report_count) })); const reportsInRange = trend.reduce((sum, row) => sum + row.reports, 0); const isMobile = useIsMobile(); const activeStatusItems = distributionItems(data.statusDistribution, ACTIVE_STATUS_ORDER); const allStatusItems = distributionItems(data.statusDistribution, STATUS_ORDER); const severityItems = distributionItems(data.citizenSeverityDistribution, SEVERITY_ORDER); const departments = data.departmentWorkload ? departmentItems(data.departmentWorkload) : null;
  async function updateRange(nextRange: DashboardRange) { if (nextRange === range) return; const id = requestId.current + 1; requestId.current = id; setRange(nextRange); setRangeError(null); try { const response = await fetch("/api/admin/dashboard?range=" + nextRange, { cache: "no-store" }); if (!response.ok) throw new Error(); const nextData = await response.json() as DashboardData; if (requestId.current === id) startTransition(() => setData(nextData)); } catch { if (requestId.current === id) { setRange(initialData.range ?? 30); setRangeError("Unable to update the incident report range. Showing the previous range."); } } }
  return <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 dashboard:grid-cols-4"><h1 className="sr-only">Operations Dashboard</h1>
    <QuickActions isSystemAdmin={isSystemAdmin} />
    <Card className="self-start lg:col-span-2 dashboard:col-span-3"><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-col gap-1.5"><CardTitle className="font-mono text-2xl tabular-nums">{reportsInRange.toLocaleString()}</CardTitle><CardDescription>Incident Reports Over Time {SEP} last {range} days</CardDescription></div><CardAction><RangeControl isUpdating={isPending} onChange={updateRange} range={range} /></CardAction></CardHeader><CardContent><p className="sr-only" id="incident-chart-description">Submitted citizen reports by calendar date for the last {range} days. Missing dates are shown as zero.</p><ChartContainer aria-describedby="incident-chart-description" aria-label={"Submitted citizen reports over the last " + range + " days"} className="h-60 min-h-60 w-full sm:h-64" config={trendChartConfig} role="img"><AreaChart accessibilityLayer data={trend} margin={{ left: 8, right: 8 }}><defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-reports)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--color-reports)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} /><XAxis axisLine={false} dataKey="date" minTickGap={range === 90 ? 42 : 28} tickCount={isMobile ? 4 : range === 90 ? 6 : 7} tickFormatter={formatShortDate} tickLine={false} tickMargin={8} /><ChartTooltip content={<IncidentTooltip />} cursor={{ stroke: "var(--color-reports)", strokeDasharray: "3 3", strokeLinecap: "round" }} wrapperStyle={{ outline: "none" }} /><Area dataKey="reports" dot={{ fill: "var(--color-reports)", r: 2.5, strokeWidth: 2 }} fill={"url(#" + gradientId + ")"} isAnimationActive={false} name="Submitted reports" stroke="var(--color-reports)" strokeWidth={2} type="monotone" /></AreaChart></ChartContainer><p className="mt-2 text-xs text-muted-foreground">Daily submitted reports {SEP} Missing dates shown as zero</p>{rangeError && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{rangeError}</p>}</CardContent></Card>
    <Card className="@container flex self-start flex-col gap-0 pb-0 lg:col-span-2 dashboard:col-span-1"><CardHeader className="flex flex-row items-start justify-between gap-3 border-b"><div className="flex min-w-0 flex-col gap-0"><CardTitle className="font-mono text-2xl tabular-nums">{numeric(data.kpis.active_count).toLocaleString()}</CardTitle><CardDescription>active tickets</CardDescription></div><Badge variant="secondary">{numeric(data.kpis.high_urgency_count)} high urgency</Badge></CardHeader><CardContent className="flex min-h-0 flex-1 p-0"><DistributionDonutChart ariaLabel="Active ticket lifecycle distribution" centerLabel="Active" config={statusChartConfig} description="Active tickets grouped by lifecycle status." items={activeStatusItems} size="compact" /></CardContent><div className="mt-auto grid grid-cols-2 border-t text-xs"><div className="min-w-0 px-4 py-3"><strong className="block font-mono text-base text-foreground">{numeric(data.kpis.reports_this_month_count)}</strong><span className="text-muted-foreground">Reports this month</span></div><div className="min-w-0 border-l px-4 py-3"><strong className="block font-mono text-base text-foreground">{formatHours(data.kpis.avg_resolution_hours_30d)}</strong><span className="text-muted-foreground">Avg resolution</span></div></div></Card>
    <RankedTableCard kind="barangay" rows={data.leaderboard} /><RankedTableCard kind="category" rows={data.categories} />
    <section aria-label="Dashboard analytics" className={"grid min-w-0 grid-cols-1 items-stretch gap-3 lg:col-span-2 lg:grid-cols-2 dashboard:col-span-4 " + (departments ? "dashboard:grid-cols-3" : "dashboard:grid-cols-2")}><AnalyticsCard description="All tickets grouped by lifecycle status." title="Ticket Status Distribution"><DistributionDonutChart ariaLabel="Ticket status distribution" config={statusChartConfig} description="All tickets grouped by lifecycle status." items={allStatusItems} /></AnalyticsCard><AnalyticsCard description="Citizen-selected severity in the latest 30 days; not system urgency." title="Reports by Citizen Severity"><SeverityRadialChart ariaLabel="Reports by citizen severity" config={severityChartConfig} description="Citizen-selected severity in the latest 30 days; not system urgency." items={severityItems} /></AnalyticsCard>{departments && <AnalyticsCard description="Active tickets by assigned office." title="Department Workload"><DepartmentWorkloadComparison ariaLabel="Department workload" config={departmentChartConfig} description="Active tickets assigned to MEO and MDRRMO." items={departments} /></AnalyticsCard>}</section>
  </div>;
}
