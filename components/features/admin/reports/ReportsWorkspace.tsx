"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  DownloadIcon,
  Flag,
  Gauge,
  Hourglass,
  PrinterIcon,
  Ticket as TicketIcon,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DashboardSummary } from "@/app/admin/reports/page";
import type { AdminDirectoryRow } from "@/lib/types/admin-directory";
import { TICKET_CATEGORIES, ALL_TICKET_CATEGORIES, TICKET_STATUSES } from "@/lib/types/admin-ticket-constants";
import { WORK_ORDER_STATUSES, type WorkOrderStatus } from "@/lib/types/admin-work-orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminErrorCard } from "../shared/AdminErrorCard";

const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface FilterState {
  office: string; // "all" | "MEO" | "MDRRMO" — "all" only meaningful for a system admin
  dateFrom: string;
  dateTo: string;
  ticketStatus: string;
  ticketCategory: string;
  ticketUrgency: string;
  workOrderStatus: string;
  assignedAdminId: string;
}

function initialFilterState(query: Record<string, string | undefined>, sessionOffice?: string): FilterState {
  const office = query.office === "MEO" || query.office === "MDRRMO" ? query.office : (sessionOffice ?? "all");
  return {
    office,
    dateFrom: query.dateFrom ?? "",
    dateTo: query.dateTo ?? "",
    ticketStatus:
      query.status === "all" || (TICKET_STATUSES as string[]).includes(query.status ?? "") ? (query.status as string) : "all",
    ticketCategory: (ALL_TICKET_CATEGORIES as readonly string[]).includes(query.category ?? "") ? (query.category as string) : "",
    ticketUrgency: ["Low", "Medium", "High"].includes(query.urgency ?? "") ? (query.urgency as string) : "",
    workOrderStatus: (WORK_ORDER_STATUSES as string[]).includes(query.workOrderStatus ?? "") ? (query.workOrderStatus as string) : "all",
    assignedAdminId: query.assignedAdminId ?? "",
  };
}

function buildTicketExportParams(f: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (f.office !== "all") params.set("office", f.office);
  if (f.ticketStatus !== "all") params.set("status", f.ticketStatus);
  if (f.ticketCategory) params.set("category", f.ticketCategory);
  if (f.ticketUrgency) params.set("urgency", f.ticketUrgency);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  return params;
}

function buildWorkOrderExportParams(f: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (f.office !== "all") params.set("office", f.office);
  if (f.workOrderStatus !== "all") params.set("status", f.workOrderStatus);
  if (f.assignedAdminId) params.set("assignedAdminId", f.assignedAdminId);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  return params;
}

// Params that appear in the URL for shareability/back-forward — kept
// deliberately small (office + date range) rather than mirroring every
// export-only filter, matching the "sync what's navigation-relevant" spirit
// of TicketsWorkspace/WorkOrdersWorkspace without duplicating their exact shape.
function buildUrlParams(f: Pick<FilterState, "office" | "dateFrom" | "dateTo">): URLSearchParams {
  const params = new URLSearchParams();
  if (f.office !== "all") params.set("office", f.office);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  return params;
}

export function ReportsWorkspace({
  initialSummary,
  initialQuery,
  sessionOffice,
  isSystemAdmin = false,
}: {
  initialSummary: DashboardSummary;
  initialQuery: Record<string, string | undefined>;
  sessionOffice?: string;
  isSystemAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<FilterState>(() => initialFilterState(initialQuery, sessionOffice));
  const [summary, setSummary] = useState(initialSummary);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<AdminDirectoryRow[]>([]);
  const skipSummaryFetchRef = useRef(true);

  useEffect(() => {
    const params = buildUrlParams({ office: filters.office, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [filters.office, filters.dateFrom, filters.dateTo, pathname, router]);

  // Re-scores the printable summary to the selected office — the export
  // cards below don't need this refetch since they build their own URLs and
  // let the backend (the real security gate) apply resolveOfficeScope.
  useEffect(() => {
    if (!isSystemAdmin) return;
    if (skipSummaryFetchRef.current) {
      skipSummaryFetchRef.current = false;
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    const qs = filters.office !== "all" ? `?office=${filters.office}` : "";
    fetch(`/api/admin/dashboard${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json: DashboardSummary) => {
        if (!cancelled) setSummary(json);
      })
      .catch((err) => {
        if (!cancelled) setSummaryError(err instanceof Error ? err.message : "Failed to refresh summary.");
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.office, isSystemAdmin]);

  useEffect(() => {
    let cancelled = false;
    const officeQs = filters.office !== "all" ? `?office=${filters.office}` : "";
    fetch(`/api/admin/admins/directory${officeQs}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdminDirectoryRow[]) => {
        if (!cancelled) setDirectory(data);
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.office]);

  function updateFilter(patch: Partial<FilterState>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  const ticketExportHref = `/api/admin/reports/tickets.csv?${buildTicketExportParams(filters).toString()}`;
  const workOrderExportHref = `/api/admin/reports/work-orders.csv?${buildWorkOrderExportParams(filters).toString()}`;

  const totalTickets = summary.statusDistribution.reduce((sum, r) => sum + r.count, 0);
  const perf = summary.officePerformanceSummary;
  const scopeLabel = !isSystemAdmin
    ? `${sessionOffice} office summary`
    : filters.office === "all"
      ? "City-wide summary"
      : `${filters.office} office summary`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="space-y-0.5">
          <h1 className="font-heading text-base font-semibold">Reports & Exports</h1>
          <p className="text-xs text-muted-foreground">
            Export ticket and work order data, or print an operational summary. Exports always follow the filters
            selected below.
          </p>
        </div>
        <Button onClick={() => window.print()} size="sm" variant="outline">
          <PrinterIcon />
          Print summary
        </Button>
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Office</p>
            {isSystemAdmin ? (
              <Select onValueChange={(v) => updateFilter({ office: v, assignedAdminId: "" })} value={filters.office}>
                <SelectTrigger aria-label="Office" className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All offices</SelectItem>
                  <SelectItem value="MEO">MEO</SelectItem>
                  <SelectItem value="MDRRMO">MDRRMO</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge aria-label="Office" className="h-9" variant="secondary">My Office: {sessionOffice}</Badge>
            )}
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="reports-date-from">From date</label>
            <Input
              className="w-40"
              id="reports-date-from"
              onChange={(e) => updateFilter({ dateFrom: e.target.value })}
              type="date"
              value={filters.dateFrom}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="reports-date-to">To date</label>
            <Input
              className="w-40"
              id="reports-date-to"
              onChange={(e) => updateFilter({ dateTo: e.target.value })}
              type="date"
              value={filters.dateTo}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ticket Export</CardTitle>
            <CardDescription>Filter tickets by status, category, and urgency, then export as CSV.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Select onValueChange={(v) => updateFilter({ ticketStatus: v })} value={filters.ticketStatus}>
                <SelectTrigger aria-label="Ticket status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active / Open</SelectItem>
                  {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => updateFilter({ ticketCategory: v === "all" ? "" : v })} value={filters.ticketCategory || "all"}>
                <SelectTrigger aria-label="Ticket category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => updateFilter({ ticketUrgency: v === "all" ? "" : v })} value={filters.ticketUrgency || "all"}>
                <SelectTrigger aria-label="Ticket urgency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All urgency bands</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button asChild className="self-start">
              <a href={ticketExportHref}>
                <DownloadIcon />
                Export Tickets CSV
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Work Order Export</CardTitle>
            <CardDescription>Filter work orders by status and assigned admin, then export as CSV.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Select onValueChange={(v) => updateFilter({ workOrderStatus: v })} value={filters.workOrderStatus}>
                <SelectTrigger aria-label="Work order status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {WORK_ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{WORK_ORDER_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => updateFilter({ assignedAdminId: v === "all" ? "" : v })} value={filters.assignedAdminId || "all"}>
                <SelectTrigger aria-label="Assigned admin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  {directory.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button asChild className="self-start">
              <a href={workOrderExportHref}>
                <DownloadIcon />
                Export Work Orders CSV
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card aria-label="Printable operational summary" role="region">
        <CardHeader>
          <CardTitle>Operational Summary</CardTitle>
          <CardDescription>{scopeLabel}{summaryLoading ? " — refreshing…" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryError ? (
            <AdminErrorCard message={summaryError} title="Couldn't refresh summary" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile icon={TicketIcon} label="Total Tickets" tint="bg-slate-100 text-slate-600" value={totalTickets} />
              <SummaryTile icon={Gauge} label="Active Tickets" tint="bg-blue-50 text-blue-600" value={summary.kpis.active_count} />
              <SummaryTile icon={AlertTriangle} label="High Urgency Tickets" tint="bg-red-50 text-red-600" value={perf.highUrgencyOpenTickets} />
              <SummaryTile icon={Hourglass} label="Pending Work Orders" tint="bg-amber-50 text-amber-600" value={perf.pendingWorkOrders} />
              <SummaryTile icon={Wrench} label="In-Progress Work Orders" tint="bg-indigo-50 text-indigo-600" value={perf.inProgressWorkOrders} />
              <SummaryTile icon={AlertTriangle} label="Overdue Work Orders" tint="bg-red-50 text-red-600" value={perf.overdueWorkOrders} />
              <SummaryTile icon={CheckCircle2} label="Completed This Week" tint="bg-emerald-50 text-emerald-600" value={perf.completedWorkOrdersThisWeek} />
              <SummaryTile icon={Flag} label="Pending Flagged Reports" tint="bg-orange-50 text-orange-600" value={perf.flaggedReportsPending} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, tint, value }: { icon: LucideIcon; label: string; tint: string; value: number }) {
  return (
    <Card className="py-0 shadow-xs">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tint} print:hidden`}>
          <Icon aria-hidden="true" className="size-4.5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="truncate text-xs text-muted-foreground" title={label}>{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
