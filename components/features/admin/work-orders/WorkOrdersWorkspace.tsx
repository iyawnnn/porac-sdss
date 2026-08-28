"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardListIcon, DownloadIcon, Inbox, Wrench } from "lucide-react";
import type { PaginatedWorkOrders, WorkOrderListRow, WorkOrderRow, WorkOrderStatus } from "@/lib/types/admin-work-orders";
import { WORK_ORDER_STATUSES } from "@/lib/types/admin-work-orders";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { AdminErrorCard } from "../shared/AdminErrorCard";
import { EmptyState } from "../shared/EmptyState";
import { KpiCard } from "../shared/KpiCard";
import { CreateWorkOrderDialog } from "./CreateWorkOrderDialog";
import { WorkOrderStatusSelect } from "./WorkOrderStatusSelect";
import { WorkOrderAssigneeSelect } from "./WorkOrderAssigneeSelect";
import { WorkOrderDueDateEditor } from "./WorkOrderDueDateEditor";

// Shared with QueueRow's own "level" badge (Ticket Queue) so a row can never
// disagree with how urgency reads there — one className map, not two.
function UrgencyBadge({ priorityScore }: { priorityScore: number | null }) {
  const badge = getUrgencyBadgeConfig(priorityScore);
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap ${badge.className}`}>
      {badge.label}
    </span>
  );
}

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface QueryState {
  office: string;
  status: string;
  overdue: boolean;
  mine: boolean;
  page: number;
}

function initialQueryState(query: Record<string, string | undefined>, sessionOffice?: string): QueryState {
  const office =
    query.office === "all" || query.office === "MEO" || query.office === "MDRRMO" ? query.office : (sessionOffice ?? "all");
  const status = (WORK_ORDER_STATUSES as string[]).includes(query.status ?? "") ? (query.status as string) : "all";
  return {
    office,
    status,
    overdue: query.overdue === "true",
    mine: query.assignedAdminId === "me",
    page: Math.max(1, Number(query.page) || 1),
  };
}

function buildParams(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("office", state.office);
  if (state.status !== "all") params.set("status", state.status);
  if (state.overdue) params.set("overdue", "true");
  // "me" is resolved server-side from the caller's own session
  // (WorkOrdersService.parseQuery) — the URL never carries a specific
  // admin's numeric id, so the same link means "my assignments" for
  // whoever opens it, exactly like ?overdue=true is viewer-relative.
  if (state.mine) params.set("assignedAdminId", "me");
  params.set("page", String(state.page));
  return params;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WorkOrdersWorkspace({
  initialData,
  initialQuery,
  sessionOffice,
  isSystemAdmin = false,
}: {
  initialData: PaginatedWorkOrders;
  initialQuery: Record<string, string | undefined>;
  sessionOffice?: string;
  isSystemAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<QueryState>(() => initialQueryState(initialQuery, sessionOffice));
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const skipFetchRef = useRef(true);

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    const params = buildParams(query);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/work-orders?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load work orders.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, pathname, router, refetchNonce]);

  function updateFilter(patch: Partial<QueryState>) {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  // CreateWorkOrderDialog and the inline status/assignee/due-date widgets all
  // return a plain WorkOrderRow (no linked-ticket urgency — that's a list-only
  // join, see WorkOrdersService.list). Merging onto the existing row instead
  // of replacing it keeps a row's urgency badge visible through an edit; a
  // freshly created row simply has no urgency yet, until the list next
  // refetches (e.g. a filter change).
  function handleCreated(created: WorkOrderRow) {
    setData((d) => ({
      ...d,
      workOrders: [{ ...created, priority_score: null, urgency_level: null }, ...d.workOrders],
      total: d.total + 1,
    }));
  }

  function handleUpdated(updated: WorkOrderRow) {
    setData((d) => ({ ...d, workOrders: d.workOrders.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)) }));
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold text-ink-900">Work Orders</h1>
          <p className="text-sm text-muted-foreground">
            {isSystemAdmin ? "Field work tracked across every office." : `Field work tracked for ${sessionOffice}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/reports/work-orders.csv?${buildParams(query).toString()}`}>
              <DownloadIcon />
              Export CSV
            </a>
          </Button>
          <CreateWorkOrderDialog
            onCreated={handleCreated}
            sessionOffice={sessionOffice === "MEO" || sessionOffice === "MDRRMO" ? sessionOffice : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={Inbox} label="Pending" value={data.kpis.pendingWorkOrders.toLocaleString()} />
        <KpiCard icon={Wrench} label="In Progress" value={data.kpis.inProgressWorkOrders.toLocaleString()} />
        <KpiCard icon={AlertTriangle} label="Overdue" value={data.kpis.overdueWorkOrders.toLocaleString()} />
        <KpiCard icon={CheckCircle2} label="Completed This Week" value={data.kpis.completedWorkOrdersThisWeek.toLocaleString()} />
      </div>

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          {isSystemAdmin ? (
            <Select onValueChange={(v) => updateFilter({ office: v })} value={query.office}>
              <SelectTrigger aria-label="Office"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All offices</SelectItem>
                <SelectItem value="MEO">MEO</SelectItem>
                <SelectItem value="MDRRMO">MDRRMO</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge aria-label="Office" variant="secondary">My Office: {sessionOffice}</Badge>
          )}
          <Select onValueChange={(v) => updateFilter({ status: v })} value={query.status}>
            <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {WORK_ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => updateFilter({ overdue: !query.overdue })} size="sm" variant={query.overdue ? "default" : "outline"}>
            Overdue only
          </Button>
          <Button onClick={() => updateFilter({ mine: !query.mine })} size="sm" variant={query.mine ? "default" : "outline"}>
            My Assignments
          </Button>
          {query.mine && (
            <Badge variant="secondary">
              Showing only work assigned to you
            </Badge>
          )}
        </CardContent>

        {/* Desktop table */}
        <CardContent className="hidden min-w-0 p-0 md:block">
          <Table className="[&_td]:py-1.5 [&_th]:h-8">
            <TableHeader className="bg-muted/40">
              {/* Urgency and Office each open a tier (State, Assignment) — a
                  left rule on those two cells (mirrored on the body cells
                  below) is the tier boundary; Created stays outside any tier,
                  it's metadata, not identity/state/assignment. */}
              <TableRow>
                <TableHead className="pl-6">Work Order</TableHead>
                <TableHead className="border-l text-center">Urgency</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Due</TableHead>
                <TableHead className="border-l text-center">Office</TableHead>
                <TableHead className="text-center">Assigned</TableHead>
                <TableHead className="pr-6 text-center">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-4" colSpan={7}><AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh work orders" /></TableCell>
                </TableRow>
              ) : loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow className="hover:bg-transparent" key={i}>
                    {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full max-w-24" /></TableCell>)}
                  </TableRow>
                ))
              ) : data.workOrders.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-0" colSpan={7}>
                    <EmptyState description="Create one from a ticket, or search for one here." icon={ClipboardListIcon} title="No work orders match this filter." />
                  </TableCell>
                </TableRow>
              ) : (
                data.workOrders.map((wo) => <WorkOrderDesktopRow key={wo.id} onUpdated={handleUpdated} workOrder={wo} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {error ? (
          <AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh work orders" />
        ) : loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton className="h-28 w-full" key={i} />)
        ) : data.workOrders.length === 0 ? (
          <Card><CardContent className="p-0"><EmptyState className="p-8" description="Create one from a ticket, or search for one here." icon={ClipboardListIcon} title="No work orders match this filter." /></CardContent></Card>
        ) : (
          data.workOrders.map((wo) => <WorkOrderCard key={wo.id} onUpdated={handleUpdated} workOrder={wo} />)
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{data.total === 0 ? "No work orders" : `Showing ${from}–${to} of ${data.total}`}</p>
        {data.totalPages > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  aria-disabled={data.page <= 1}
                  className={data.page <= 1 ? "pointer-events-none opacity-40" : undefined}
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (data.page > 1) setQuery((q) => ({ ...q, page: q.page - 1 })); }}
                />
              </PaginationItem>
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink href="#" isActive={p === data.page} onClick={(e) => { e.preventDefault(); setQuery((q) => ({ ...q, page: p })); }}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  aria-disabled={data.page >= data.totalPages}
                  className={data.page >= data.totalPages ? "pointer-events-none opacity-40" : undefined}
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (data.page < data.totalPages) setQuery((q) => ({ ...q, page: q.page + 1 })); }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}

function WorkOrderDesktopRow({ workOrder, onUpdated }: { workOrder: WorkOrderListRow; onUpdated: (w: WorkOrderRow) => void }) {
  return (
    <TableRow>
      {/* Identity */}
      <TableCell className="max-w-56 pl-6">
        <p className="truncate font-medium">{workOrder.title}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Work order #{workOrder.id}</span>
          <span aria-hidden="true">·</span>
          <Link className="text-brand-600 hover:underline" href={`/admin/tickets/${workOrder.ticket_id}`}>Ticket #{workOrder.ticket_id}</Link>
        </p>
      </TableCell>
      {/* State */}
      <TableCell className="border-l text-center"><UrgencyBadge priorityScore={workOrder.priority_score} /></TableCell>
      <TableCell className="text-center"><WorkOrderStatusSelect onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
      <TableCell className="text-center"><WorkOrderDueDateEditor onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
      {/* Assignment */}
      <TableCell className="border-l text-center">{workOrder.assigned_office}</TableCell>
      <TableCell className="text-center"><WorkOrderAssigneeSelect onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
      <TableCell className="pr-6 text-center text-xs text-muted-foreground">{formatDate(workOrder.created_at)}</TableCell>
    </TableRow>
  );
}

function WorkOrderCard({ workOrder, onUpdated }: { workOrder: WorkOrderListRow; onUpdated: (w: WorkOrderRow) => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Identity */}
        <div className="min-w-0">
          <p className="truncate font-medium">{workOrder.title}</p>
          <p className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
            <span>#{workOrder.id}</span>
            <span aria-hidden="true">·</span>
            <Link className="text-brand-600 hover:underline" href={`/admin/tickets/${workOrder.ticket_id}`}>Ticket #{workOrder.ticket_id}</Link>
          </p>
        </div>
        {/* State */}
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge priorityScore={workOrder.priority_score} />
          <WorkOrderStatusSelect onUpdated={onUpdated} workOrder={workOrder} />
          <WorkOrderDueDateEditor onUpdated={onUpdated} workOrder={workOrder} />
        </div>
        {/* Assignment */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <Badge variant="secondary">{workOrder.assigned_office}</Badge>
          <WorkOrderAssigneeSelect onUpdated={onUpdated} workOrder={workOrder} />
        </div>
      </CardContent>
    </Card>
  );
}
