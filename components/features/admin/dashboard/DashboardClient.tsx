"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { FileText, Inbox, Ticket } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { DASHBOARD_RANGES, type BarangayRiskRow, type CategoryDistributionRow, type DashboardKpis, type DashboardRange, type DistributionRow, type IncidentTrendRow, type OfficePerformanceSummary as OfficePerformanceSummaryData, type NeedsAttention as NeedsAttentionData } from "@/lib/types/admin-dashboard";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { relativeAge } from "@/lib/utils/ui/time";
import { StatusPill } from "../shared/StatusPill";
import { NeedsAttention } from "./NeedsAttention";

const SEP = "·";
const trendChartConfig = { reports: { label: "Submitted reports", color: "var(--color-brand-500)" } } satisfies ChartConfig;

// departmentWorkload/citizenSeverityDistribution/leaderboard/categories/
// statusDistribution stay in the fetched payload and this type — the API
// response and its shape are unchanged — even though none of them render
// on the dashboard landing page anymore (see docs/design-system.md-era
// Phase 3 correction: Barangay Activity, Category Distribution, Ticket
// Status Distribution, Reports by Citizen Severity, Department Workload,
// Office Performance Summary, Quick Actions, and Map Presets were removed
// from this composition — their components/data remain intact, just
// unreachable from /admin until a future task gives them a home).
type DashboardData = { kpis: DashboardKpis; leaderboard: BarangayRiskRow[]; categories: CategoryDistributionRow[]; incidentTrend: IncidentTrendRow[]; statusDistribution: DistributionRow[]; departmentWorkload: DistributionRow[] | null; citizenSeverityDistribution: DistributionRow[]; officePerformanceSummary: OfficePerformanceSummaryData; needsAttention: NeedsAttentionData; range?: DashboardRange };

function numeric(value: number | string | null | undefined): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatShortDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatLongDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }

function IncidentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { date: string; reports: number } }> }) { const row = payload?.[0]?.payload; if (!active || !row) return null; return <div data-testid="incident-chart-tooltip" className="grid min-w-44 gap-1 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl"><p className="font-medium">{formatLongDate(row.date)}</p><div className="flex items-center justify-between gap-4 text-muted-foreground"><span>Submitted reports</span><strong className="font-mono text-sm text-foreground">{numeric(row.reports).toLocaleString()}</strong></div></div>; }
function RangeControl({ range, isUpdating, onChange }: { range: DashboardRange; isUpdating: boolean; onChange: (range: DashboardRange) => void }) { return <ToggleGroup aria-label="Incident report date range" disabled={isUpdating} onValueChange={(value) => { const nextRange = Number(value); if (DASHBOARD_RANGES.includes(nextRange as DashboardRange)) onChange(nextRange as DashboardRange); }} size="sm" spacing={0} type="single" value={String(range)} variant="outline">{DASHBOARD_RANGES.map((days) => <ToggleGroupItem aria-label={"Last " + days + " Days"} key={days} value={String(days)}>Last {days} Days</ToggleGroupItem>)}</ToggleGroup>; }

// All three KPI cards share one anatomy: a compact header (label + icon),
// a hairline divider, then a body with the metric lower-left and a caption
// underneath. A sparkline (lower-right) only appears where honest
// time-series data exists — Reports This Month is the only KPI with a real
// nearby history (data.incidentTrend); Active Tickets and Pending Work
// Orders are point-in-time counts with no history anywhere in the API
// response, so they get an honest caption instead of a fabricated chart.
function KpiCard({ label, value, caption, icon: Icon, sparkline }: { label: string; value: string; caption: string; icon: typeof Ticket; sparkline?: { date: string; reports: number }[] }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-lg border-2 border-input bg-secondary py-0 ring-0">
      <CardHeader className="flex items-center justify-between gap-2 py-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </CardHeader>
      <div className="p-3">
        <div className="flex items-end justify-between gap-3 rounded-md border border-input bg-card p-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-[28px] leading-8 font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
            <p className="truncate text-xs text-muted-foreground">{caption}</p>
          </div>
          {sparkline && (
            <ChartContainer className="h-8 w-20 shrink-0" config={trendChartConfig}>
              <AreaChart data={sparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area dataKey="reports" dot={false} fill="var(--color-reports)" fillOpacity={0.15} isAnimationActive={false} stroke="var(--color-reports)" strokeWidth={1.5} type="monotone" />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </Card>
  );
}

const HUA_HEAD_CLASS = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

// The dashboard-landing action queue — capped and compact, deliberately not
// a second Ticket Queue. Ranked by priority_score (Hazard Urgency Score);
// there is no existing backend sort by priority_index (Operational
// Priority — api/src/admin/tickets.service.ts's parseTicketQuery only ever
// orders by priority_score), so this must never be described as
// Operational-Priority-ranked.
function HighestUrgencyActionsTable({ tickets }: { tickets: AdminTicketRow[] | null }) {
  return (
    <Card className="flex flex-col overflow-hidden rounded-lg border-2 border-input bg-secondary py-0 ring-0" data-testid="highest-urgency-actions">
      <CardHeader className="py-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">Highest Urgency Actions</CardTitle>
        <CardDescription>Highest-urgency active tickets ranked by Hazard Urgency Score.</CardDescription>
        <CardAction>
          <Link className="text-sm font-medium text-primary hover:underline" href="/admin/tickets?sort=priority_desc&status=active">View all</Link>
        </CardAction>
      </CardHeader>
      <div className="p-3 pt-0">
        <div className="overflow-hidden rounded-md border border-input bg-card">
        <Table className="text-[13px]">
          <TableCaption className="sr-only">Highest-urgency active tickets, ranked by Hazard Urgency Score.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className={HUA_HEAD_CLASS + " pl-6"} scope="col">Ticket</TableHead>
              <TableHead className={HUA_HEAD_CLASS} scope="col">Barangay</TableHead>
              <TableHead className={HUA_HEAD_CLASS} scope="col">Office</TableHead>
              <TableHead className={HUA_HEAD_CLASS + " text-center"} scope="col">Hazard Urgency</TableHead>
              <TableHead className={HUA_HEAD_CLASS + " text-center"} scope="col">Status</TableHead>
              <TableHead className={HUA_HEAD_CLASS + " text-end"} scope="col">Age</TableHead>
              <TableHead className={HUA_HEAD_CLASS + " pr-6 text-end"} scope="col">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets === null ? (
              <TableRow className="hover:bg-transparent"><TableCell className="p-6 text-center text-sm text-muted-foreground" colSpan={7}>Unable to load priority actions right now.</TableCell></TableRow>
            ) : tickets.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell className="p-6 text-center text-sm text-muted-foreground" colSpan={7}>No active tickets right now.</TableCell></TableRow>
            ) : (
              tickets.map((ticket) => {
                const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
                const detailHref = `/admin/tickets/${ticket.id}`;
                return (
                  <TableRow key={ticket.id}>
                    <TableCell className="max-w-56 pl-6">
                      <Link className="block truncate font-medium hover:text-primary hover:underline" href={detailHref} title={ticket.title ?? undefined}>{ticket.title ?? `Ticket #${ticket.id}`}</Link>
                      <div className="text-xs text-muted-foreground">Ticket <span className="font-mono">#{ticket.id}</span></div>
                    </TableCell>
                    <TableCell className="max-w-40"><span className="block truncate" title={ticket.barangay_name}>{ticket.barangay_name}</span></TableCell>
                    <TableCell>{ticket.assigned_office}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={urgencyBadge.className} variant="outline">
                        <span className="font-mono tabular-nums">{ticket.priority_score ?? "—"}</span> {urgencyBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center"><StatusPill status={ticket.status} /></TableCell>
                    <TableCell className="text-end text-xs text-muted-foreground">{relativeAge(ticket.created_at, ticket.status)}</TableCell>
                    <TableCell className="pr-6 text-end">
                      <Button asChild size="sm" variant="outline"><Link href={detailHref}>View ticket</Link></Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </Card>
  );
}

export function DashboardClient({ initialData, topPriorityTickets, adminName }: { initialData: DashboardData; topPriorityTickets: AdminTicketRow[] | null; adminName: string | null }) {
  const [data, setData] = useState(initialData); const [range, setRange] = useState<DashboardRange>(initialData.range ?? 30); const [isPending, startTransition] = useTransition(); const [rangeError, setRangeError] = useState<string | null>(null); const requestId = useRef(0); const gradientId = "incident-area-" + useId().replace(/:/g, "");
  const trend = data.incidentTrend.map((row) => ({ date: row.date, reports: numeric(row.report_count) })); const reportsInRange = trend.reduce((sum, row) => sum + row.reports, 0); const isMobile = useIsMobile();
  async function updateRange(nextRange: DashboardRange) { if (nextRange === range) return; const id = requestId.current + 1; requestId.current = id; setRange(nextRange); setRangeError(null); try { const response = await fetch("/api/admin/dashboard?range=" + nextRange, { cache: "no-store" }); if (!response.ok) throw new Error(); const nextData = await response.json() as DashboardData; if (requestId.current === id) startTransition(() => setData(nextData)); } catch { if (requestId.current === id) { setRange(initialData.range ?? 30); setRangeError("Unable to update the incident report range. Showing the previous range."); } } }
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Welcome back{adminName ? `, ${adminName}` : ""}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Here&apos;s the latest operational overview across Porac.</p>
      </div>
      <RangeControl isUpdating={isPending} onChange={updateRange} range={range} />
    </div>

    <div className="grid min-w-0 grid-cols-1 gap-3 dashboard:grid-cols-10 dashboard:items-start">
      <div className="flex min-w-0 flex-col gap-3 dashboard:col-span-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="dashboard-kpi-row">
          <KpiCard caption={`${numeric(data.kpis.high_urgency_count).toLocaleString()} high urgency`} icon={Ticket} label="Active Tickets" value={numeric(data.kpis.active_count).toLocaleString()} />
          <KpiCard caption={`${numeric(data.officePerformanceSummary.inProgressWorkOrders).toLocaleString()} in progress`} icon={Inbox} label="Pending Work Orders" value={numeric(data.officePerformanceSummary.pendingWorkOrders).toLocaleString()} />
          <KpiCard caption={`Last ${range} days shown below`} icon={FileText} label="Reports This Month" sparkline={trend} value={numeric(data.kpis.reports_this_month_count).toLocaleString()} />
        </div>

        <Card className="gap-0 overflow-hidden rounded-lg border-2 border-input bg-secondary py-0 ring-0">
          <CardHeader className="py-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Incident Reports Over Time {SEP} last {range} days</CardTitle>
          </CardHeader>
          <div className="p-3">
            <div className="rounded-md border border-input bg-card p-4">
              <p className="font-mono text-2xl tabular-nums">{reportsInRange.toLocaleString()}</p>
              <p className="sr-only" id="incident-chart-description">Submitted citizen reports by calendar date for the last {range} days. Missing dates are shown as zero.</p>
              <ChartContainer aria-describedby="incident-chart-description" aria-label={"Submitted citizen reports over the last " + range + " days"} className="mt-2 h-60 min-h-60 w-full sm:h-64" config={trendChartConfig} role="img"><AreaChart accessibilityLayer data={trend} margin={{ left: 8, right: 8 }}><defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-reports)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--color-reports)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} /><XAxis axisLine={false} dataKey="date" minTickGap={range === 90 ? 42 : 28} tickCount={isMobile ? 4 : range === 90 ? 6 : 7} tickFormatter={formatShortDate} tickLine={false} tickMargin={8} /><ChartTooltip content={<IncidentTooltip />} cursor={{ stroke: "var(--color-reports)", strokeDasharray: "3 3", strokeLinecap: "round" }} wrapperStyle={{ outline: "none" }} /><Area dataKey="reports" dot={{ fill: "var(--color-reports)", r: 2.5, strokeWidth: 2 }} fill={"url(#" + gradientId + ")"} isAnimationActive={false} name="Submitted reports" stroke="var(--color-reports)" strokeWidth={2} type="monotone" /></AreaChart></ChartContainer>
              <p className="mt-2 text-xs text-muted-foreground">Daily submitted reports {SEP} Missing dates shown as zero</p>
              {rangeError && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{rangeError}</p>}
            </div>
          </div>
        </Card>
      </div>

      <NeedsAttention data={data.needsAttention} flaggedReportsPending={numeric(data.officePerformanceSummary.flaggedReportsPending)} />
    </div>

    <HighestUrgencyActionsTable tickets={topPriorityTickets} />
  </div>;
}
