"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { BarChart3, Building2, ChartPie, ClipboardList, FileText, Gauge, Inbox, MapPinned, Shapes, Ticket } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { DASHBOARD_RANGES, type BarangayRiskRow, type CategoryDistributionRow, type CountTrendRow, type DashboardDeltas, type DashboardKpis, type DashboardRange, type DistributionRow, type IncidentTrendRow, type OfficePerformanceSummary as OfficePerformanceSummaryData, type NeedsAttention as NeedsAttentionData } from "@/lib/types/admin-dashboard";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { relativeAge } from "@/lib/utils/ui/time";
import { CardBodyPanel } from "../shared/CardBodyPanel";
import { CardHeaderRow } from "../shared/CardHeaderRow";
import { TABLE_HEAD_CLASS } from "../shared/tableHead";
import { StatusPill } from "../shared/StatusPill";
import { DeltaIndicator, KpiCard } from "../shared/KpiCard";
import { EmptyState } from "../shared/EmptyState";
import type { DistributionChartItem } from "./DistributionChartUtils";
import { DepartmentWorkloadComparison } from "./DepartmentWorkloadComparison";
import { DistributionDonutChart } from "./DistributionDonutChart";
import { MapPresets } from "./MapPresets";
import { NeedsAttention } from "./NeedsAttention";
import { OfficePerformanceSummary } from "./OfficePerformanceSummary";
import { SeverityRadialChart } from "./SeverityRadialChart";

const SEP = "·";
const STATUS_ORDER = ["Reported", "Under Review", "In Progress", "Resolved", "Rejected"] as const;
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"] as const;
const DEPARTMENT_ORDER = ["MEO", "MDRRMO"] as const;
// Neutral by design — see the --chart-* block in app/globals.css for why the
// trend series does not use brand orange (or the legacy brand blue it read
// before): brand is chrome, never data.
const trendChartConfig = { reports: { label: "Submitted reports", color: "var(--chart-bar-peak)" } } satisfies ChartConfig;
const categoryChartConfig = {
  "category-1": { color: "var(--chart-1)" },
  "category-2": { color: "var(--chart-2)" },
  "category-3": { color: "var(--chart-3)" },
  "category-4": { color: "var(--chart-4)" },
  "category-5": { color: "var(--chart-5)" },
  "other-categories": { label: "Other categories", color: "var(--muted-foreground)" },
} satisfies ChartConfig;
const statusChartConfig = {
  reported: { label: "Reported", color: "var(--color-lifecycle-reported)" },
  "under-review": { label: "Under Review", color: "var(--color-lifecycle-under-review)" },
  "in-progress": { label: "In Progress", color: "var(--color-lifecycle-in-progress)" },
  resolved: { label: "Resolved", color: "var(--color-lifecycle-resolved)" },
  rejected: { label: "Rejected", color: "var(--color-lifecycle-rejected)" },
} satisfies ChartConfig;
const severityChartConfig = {
  critical: { label: "Critical", color: "var(--color-severity-critical)" },
  high: { label: "High", color: "var(--color-severity-high)" },
  medium: { label: "Medium", color: "var(--color-severity-medium)" },
  low: { label: "Low", color: "var(--color-severity-low)" },
} satisfies ChartConfig;
const departmentChartConfig = {
  meo: { label: "MEO", color: "var(--color-office-meo)" },
  mdrrmo: { label: "MDRRMO", color: "var(--color-office-mdrrmo)" },
} satisfies ChartConfig;

// leaderboard remains in the response for compatibility even though the
// landing page does not currently render it. The restored sections below
// continue to consume every other distribution field from this same payload.
type DashboardData = { kpis: DashboardKpis; leaderboard: BarangayRiskRow[]; categories: CategoryDistributionRow[]; incidentTrend: IncidentTrendRow[]; activeTicketTrend: CountTrendRow[]; pendingWorkOrderTrend: CountTrendRow[]; statusDistribution: DistributionRow[]; departmentWorkload: DistributionRow[] | null; citizenSeverityDistribution: DistributionRow[]; officePerformanceSummary: OfficePerformanceSummaryData; needsAttention: NeedsAttentionData; deltas?: DashboardDeltas; range?: DashboardRange };

function numeric(value: number | string | null | undefined): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatShortDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatLongDate(value: string): string { const date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }
function chartKey(label: string) { return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function distributionItems(rows: DistributionRow[], labels: readonly string[]): DistributionChartItem[] { const counts = new Map(rows.map((row) => [row.label, numeric(row.count)])); return labels.map((label) => ({ key: chartKey(label), label, count: counts.get(label) ?? 0 })); }
function categoryItems(rows: CategoryDistributionRow[]): DistributionChartItem[] {
  const items = rows.map((row, index) => ({ key: `category-${index + 1}`, label: row.category, count: numeric(row.active_count) }));
  const visibleCount = items.reduce((sum, item) => sum + item.count, 0);
  const activeTotal = numeric(rows[0]?.active_total);
  return activeTotal > visibleCount ? [...items, { key: "other-categories", label: "Other categories", count: activeTotal - visibleCount }] : items;
}

function AnalyticsCard({ title, icon: Icon, children }: { title: string; icon: typeof ChartPie; children: React.ReactNode }) {
  return (
    <Card className="@container gap-0 rounded-xl bg-muted pt-2 pb-5">
      <CardHeader className="px-4 pb-2">
        <CardHeaderRow>
          <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
          <Icon aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
        </CardHeaderRow>
      </CardHeader>
      <CardBodyPanel className="flex min-h-0 flex-1">{children}</CardBodyPanel>
    </Card>
  );
}

// Dark charcoal pill, matching the approved reference composition. Uses the
// charcoal --chart-bar-peak rather than a surface token because it floats
// over the bars and needs to out-contrast them, not sit beside them.
function IncidentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { date: string; reports: number } }> }) { const row = payload?.[0]?.payload; if (!active || !row) return null; return <div data-testid="incident-chart-tooltip" className="flex items-center gap-2 rounded-md bg-[var(--chart-bar-peak)] px-2.5 py-1.5 text-xs text-white shadow-lg"><span className="text-white/70">{formatLongDate(row.date)}</span><strong className="font-mono text-sm font-semibold tabular-nums text-white">{numeric(row.reports).toLocaleString()}</strong></div>; }
// Brand orange appears on this page in exactly two chrome roles, both of
// them permitted by docs/design-system.md §2.2 ("brand orange is chrome,
// never data"): the card-header icons (decorative, aria-hidden) and the
// Highest Urgency Actions row hover (selection affordance). It is
// deliberately absent from every data surface — the sparklines, the incident
// bars, the urgency badges and the status pills stay neutral/semantic. That
// is not fussiness: the Hazard Urgency ramp is warm (amber → orange → red),
// so an orange KPI or series would sit on the same hue as urgency Medium and
// make the color channel ambiguous (§7, "warm-hue collision risk").
//
// This was three roles until the range control became a Select: the old
// segmented ToggleGroup tinted its selected segment --brand-subtle. A Select
// marks its choice with a check glyph instead, so there is nothing left to
// tint, and the control is now entirely neutral. --brand-subtle is not
// orphaned by that — the sidebar's active nav item still uses it.

// Range control for every trend series on this page — the incident bar chart
// and all three KPI sparklines (it does NOT rescope the KPI headline numbers
// or the week-over-week deltas, which are fixed at 7 days by design).
//
// A Select rather than the segmented ToggleGroup this used to be. The three
// options each read "Last N days", so a segmented control spent two of its
// three words per segment on text identical across all of them and ran ~290px
// wide beside the page title. Collapsing to a dropdown costs one click to
// change range and buys the header back.
//
// The width is pinned rather than left to the trigger's default w-fit: the
// label shrinks by a character between "Last 7 days" and "Last 30 days", so
// an auto-width trigger visibly jitters as you change range. Pinning it also
// keeps the header's right edge stable while the value changes.
//
// No per-item aria-label. The visible text is already the accessible name,
// and the trigger's own label supplies the context — which is what keeps this
// clear of WCAG 2.5.3 (Label in Name), the rule an abbreviated "7D" visible
// label paired with a spelled-out aria-label would have violated.
function RangeControl({ range, isUpdating, onChange }: { range: DashboardRange; isUpdating: boolean; onChange: (range: DashboardRange) => void }) {
  return (
    <Select
      disabled={isUpdating}
      onValueChange={(value) => { const nextRange = Number(value); if (DASHBOARD_RANGES.includes(nextRange as DashboardRange)) onChange(nextRange as DashboardRange); }}
      value={String(range)}
    >
      <SelectTrigger aria-label="Incident report date range" className="w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {DASHBOARD_RANGES.map((days) => <SelectItem key={days} value={String(days)}>Last {days} days</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// All three KPI cards share one anatomy: a compact header (label + icon),
// then a body with the metric lower-left and a sparkline lower-right — see
// KpiCard in ../shared/KpiCard.tsx.
//
// Every sparkline is real server-reconstructed history, never a projection
// of the headline number: Reports This Month reads data.incidentTrend,
// Active Tickets reads a status_history replay, and Pending Work Orders
// reads work_order_status_history. See dashboard.service.ts for the caveats
// on each — notably that work-order history only exists from its migration
// forward, so that series is short until it accumulates. sparkline stays
// optional so a card can still render honestly if a series is ever absent.

// The dashboard-landing action queue — capped and compact, deliberately not
// a second Ticket Queue. Ranked by priority_score (Hazard Urgency Score);
// there is no existing backend sort by priority_index (Operational
// Priority — api/src/admin/tickets.service.ts's parseTicketQuery only ever
// orders by priority_score), so this must never be described as
// Operational-Priority-ranked.
function HighestUrgencyActionsTable({ tickets }: { tickets: AdminTicketRow[] | null }) {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl bg-muted pt-2 pb-5" data-testid="highest-urgency-actions">
      {/* pt-2/pb-2 pairing, px-4 gutters and a bare title+icon header row are
          what make this sit in the same family as the KPI and Needs Attention
          cards — see CardBodyPanel's docblock on why pt-2 is not a free
          parameter. This card previously used py-5, which left its gray
          header band ~12px thicker than every other card on the page.

          "View all" shares the right-hand cluster with the icon rather than
          living in a CardAction. CardHeader switches to grid-cols-[1fr_auto]
          whenever a CardAction is present, which pushed the icon to the right
          edge of column 1 — i.e. directly against the link — instead of the
          card's true right edge where every other card anchors it.

          No CardDescription: the sr-only TableCaption below still gives
          assistive tech the full description, and no other dashboard card
          carries a visible subtitle. */}
      <CardHeader className="px-4 pb-2">
        <CardHeaderRow>
          <CardTitle className="text-xs font-medium text-muted-foreground">Highest Urgency Actions</CardTitle>
          <div className="flex shrink-0 items-center gap-3">
            <Link className="text-sm font-medium text-primary hover:underline" href="/admin/tickets?sort=priority_desc&status=active">View all</Link>
            <ClipboardList aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
          </div>
        </CardHeaderRow>
      </CardHeader>
      <CardBodyPanel>
        <Table className="text-[13px]">
          <TableCaption className="sr-only">Highest-urgency active tickets, ranked by Hazard Urgency Score.</TableCaption>
          {/* No bg tint on the header row — the panel is a flat white surface
              on every other card, and the uppercase micro-caps already
              separate the header from the body without one. */}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TABLE_HEAD_CLASS + " pl-4"} scope="col">Ticket</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Barangay / Office</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Hazard Urgency</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Status</TableHead>
              <TableHead className={TABLE_HEAD_CLASS + " pr-4 text-end"} scope="col">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets === null ? (
              <TableRow className="hover:bg-transparent"><TableCell className="p-6 text-center text-sm text-muted-foreground" colSpan={5}>Unable to load priority actions right now.</TableCell></TableRow>
            ) : tickets.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell className="p-0" colSpan={5}><EmptyState className="p-6" title="No active tickets right now." /></TableCell></TableRow>
            ) : (
              tickets.map((ticket) => {
                const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
                const detailHref = `/admin/tickets/${ticket.id}`;
                return (
                  <TableRow className="hover:bg-[var(--brand-subtle)]" key={ticket.id}>
                    <TableCell className="max-w-56 py-2.5 pl-4">
                      <Link className="block truncate font-medium hover:text-primary hover:underline" href={detailHref} title={ticket.title ?? undefined}>{ticket.title ?? `Ticket #${ticket.id}`}</Link>
                      <div className="text-xs text-muted-foreground">Ticket <span className="font-mono">#{ticket.id}</span></div>
                    </TableCell>
                    {/* Barangay over office in one cell, mirroring the Ticket
                        cell's primary-over-secondary idiom. Office is a bare
                        MEO/MDRRMO token that reads fine as a subline and does
                        not warrant a column of its own in a card that is
                        explicitly not a second Ticket Queue. */}
                    <TableCell className="max-w-40 py-2.5">
                      <span className="block truncate" title={ticket.barangay_name}>{ticket.barangay_name}</span>
                      <span className="block text-xs text-muted-foreground">{ticket.assigned_office}</span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge className={urgencyBadge.className} variant="outline">
                        <span className="font-mono tabular-nums">{ticket.priority_score ?? "—"}</span> {urgencyBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5"><StatusPill status={ticket.status} /></TableCell>
                    {/* Age is the only right-aligned column: it is the one
                        genuinely scannable quantity here. The urgency score
                        stays left with its badge — right-aligning a pill
                        column would bunch it against the status pills rather
                        than form a numeric edge. */}
                    <TableCell className="py-2.5 pr-4 text-end text-xs text-muted-foreground">{relativeAge(ticket.created_at, ticket.status)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardBodyPanel>
    </Card>
  );
}

export function DashboardClient({ initialData, topPriorityTickets, adminName }: { initialData: DashboardData; topPriorityTickets: AdminTicketRow[] | null; adminName: string | null }) {
  const [data, setData] = useState(initialData); const [range, setRange] = useState<DashboardRange>(initialData.range ?? 30); const [isPending, startTransition] = useTransition(); const [rangeError, setRangeError] = useState<string | null>(null); const requestId = useRef(0);
  const trend = data.incidentTrend.map((row) => ({ date: row.date, reports: numeric(row.report_count) })); const reportsInRange = trend.reduce((sum, row) => sum + row.reports, 0); const isMobile = useIsMobile();
  // Peak drives both the charcoal accent bar and the dashed reference line.
  // Guarded at 0 so an all-zero range (a legitimate state — see the zero-total
  // dashboard spec) highlights nothing instead of painting every bar dark.
  const peakReports = trend.reduce((max, row) => Math.max(max, row.reports), 0);
  // ?? [] rather than assuming presence: an older API build (or a partial
  // deploy where the UI ships ahead of the NestJS side) simply omits these
  // fields, and KpiCard drops the sparkline instead of throwing.
  const activeTicketSeries = (data.activeTicketTrend ?? []).map((row) => ({ date: row.date, value: numeric(row.count) }));
  const pendingWorkOrderSeries = (data.pendingWorkOrderTrend ?? []).map((row) => ({ date: row.date, value: numeric(row.count) }));
  const reportSeries = trend.map((row) => ({ date: row.date, value: row.reports }));
  const categories = categoryItems(data.categories);
  const statuses = distributionItems(data.statusDistribution, STATUS_ORDER);
  const severities = distributionItems(data.citizenSeverityDistribution, SEVERITY_ORDER);
  const departments = data.departmentWorkload ? distributionItems(data.departmentWorkload, DEPARTMENT_ORDER) : null;
  const isSystemAdmin = data.officePerformanceSummary.scope === "ALL";
  const office = data.officePerformanceSummary.scope === "ALL" ? undefined : data.officePerformanceSummary.scope;
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
          {/* No caption line any more. These carried a secondary figure each
              ("N high urgency", "N in progress", "Last N days"); the cards now
              show the headline number and its week-over-week delta only.
              kpis.high_urgency_count and officePerformanceSummary
              .inProgressWorkOrders are consequently fetched but unrendered —
              the API response shape is deliberately unchanged, same as the
              other payload fields this composition stopped displaying. */}
          <KpiCard delta={data.deltas?.activeTickets} icon={Ticket} label="Active Tickets" sparkline={activeTicketSeries} value={numeric(data.kpis.active_count).toLocaleString()} />
          <KpiCard delta={data.deltas?.pendingWorkOrders} icon={Inbox} label="Pending Work Orders" sparkline={pendingWorkOrderSeries} value={numeric(data.officePerformanceSummary.pendingWorkOrders).toLocaleString()} />
          <KpiCard delta={data.deltas?.reports} icon={FileText} label="Reports This Month" sparkline={reportSeries} value={numeric(data.kpis.reports_this_month_count).toLocaleString()} />
        </div>

        <Card className="gap-0 rounded-xl bg-muted pt-2 pb-5">
          <CardHeader className="px-4 pb-2">
            <CardHeaderRow>
              <CardTitle className="text-xs font-medium text-muted-foreground">Incident Reports Over Time {SEP} last {range} days</CardTitle>
              <BarChart3 aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
            </CardHeaderRow>
          </CardHeader>
          <CardBodyPanel className="px-4 pt-3 pb-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-mono text-2xl tabular-nums">{reportsInRange.toLocaleString()}</p>
              <DeltaIndicator delta={data.deltas?.reports} />
            </div>
            <p className="sr-only" id="incident-chart-description">Submitted citizen reports by calendar date for the last {range} days. Missing dates are shown as zero.</p>
            <ChartContainer aria-describedby="incident-chart-description" aria-label={"Submitted citizen reports over the last " + range + " days"} className="mt-2 h-60 min-h-60 w-full sm:h-64" config={trendChartConfig} data-testid="incident-trend-chart" role="img"><BarChart accessibilityLayer data={trend} margin={{ left: 8, right: 8, top: 8 }}><CartesianGrid horizontal stroke="var(--chart-grid)" vertical={false} /><XAxis axisLine={false} dataKey="date" minTickGap={range === 90 ? 42 : 28} tick={{ fill: "var(--chart-axis-text)", fontSize: 11 }} tickCount={isMobile ? 4 : range === 90 ? 6 : 7} tickFormatter={formatShortDate} tickLine={false} tickMargin={8} /><YAxis axisLine={false} orientation="right" tick={{ fill: "var(--chart-axis-text)", fontSize: 11 }} tickLine={false} tickMargin={4} width={40} /><ChartTooltip content={<IncidentTooltip />} cursor={false} wrapperStyle={{ outline: "none" }} />{peakReports > 0 && <ReferenceLine ifOverflow="extendDomain" stroke="var(--chart-reference)" strokeDasharray="4 4" y={peakReports} />}<Bar dataKey="reports" isAnimationActive={false} name="Submitted reports" radius={[4, 4, 0, 0]}>{trend.map((row) => <Cell fill={row.reports === peakReports && peakReports > 0 ? "var(--chart-bar-peak)" : "var(--chart-bar)"} key={row.date} />)}</Bar></BarChart></ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">Daily submitted reports {SEP} Missing dates shown as zero</p>
            {rangeError && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{rangeError}</p>}
          </CardBodyPanel>
        </Card>
      </div>

      <NeedsAttention data={data.needsAttention} flaggedReportsPending={numeric(data.officePerformanceSummary.flaggedReportsPending)} />
    </div>

    <HighestUrgencyActionsTable tickets={topPriorityTickets} />

    <div className="flex min-w-0 flex-col gap-3">
      <OfficePerformanceSummary summary={data.officePerformanceSummary} />

      <section aria-label="Dashboard analytics" className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2" role="region">
        <AnalyticsCard icon={Shapes} title="Category Distribution">
          <DistributionDonutChart ariaLabel="Active ticket category distribution" config={categoryChartConfig} description="Active tickets grouped by hazard category." items={categories} />
        </AnalyticsCard>
        <AnalyticsCard icon={ChartPie} title="Ticket Status Distribution">
          <DistributionDonutChart ariaLabel="Ticket status distribution" config={statusChartConfig} description="All tickets grouped by lifecycle status." items={statuses} />
        </AnalyticsCard>
        <AnalyticsCard icon={Gauge} title="Reports by Citizen Severity">
          <SeverityRadialChart ariaLabel="Reports by citizen severity" config={severityChartConfig} description="Citizen-selected severity in the latest 30 days; not system urgency." items={severities} />
        </AnalyticsCard>
        {departments && (
          <AnalyticsCard icon={Building2} title="Department Workload">
            <DepartmentWorkloadComparison ariaLabel="Department workload" config={departmentChartConfig} description="Active tickets assigned to MEO and MDRRMO." items={departments} />
          </AnalyticsCard>
        )}
      </section>

      <Card className="gap-0 rounded-xl bg-muted pt-2 pb-5">
        <CardHeader className="px-4 pb-2">
          <CardHeaderRow>
            <CardTitle className="text-xs font-medium text-muted-foreground">Map Presets</CardTitle>
            <MapPinned aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
          </CardHeaderRow>
        </CardHeader>
        <CardBodyPanel className="p-4">
          <MapPresets isSystemAdmin={isSystemAdmin} office={office} />
        </CardBodyPanel>
      </Card>
    </div>
  </div>;
}
