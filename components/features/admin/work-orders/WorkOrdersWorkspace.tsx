"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardListIcon, DownloadIcon } from "lucide-react";
import type { PaginatedWorkOrders, WorkOrderRow, WorkOrderStatus } from "@/lib/types/admin-work-orders";
import { WORK_ORDER_STATUSES } from "@/lib/types/admin-work-orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { AdminErrorCard } from "../shared/AdminErrorCard";
import { EmptyState } from "../shared/EmptyState";
import { CreateWorkOrderDialog } from "./CreateWorkOrderDialog";
import { WorkOrderStatusBadge } from "./WorkOrderStatusBadge";
import { WorkOrderStatusSelect } from "./WorkOrderStatusSelect";
import { WorkOrderAssigneeSelect } from "./WorkOrderAssigneeSelect";
import { WorkOrderDueDateEditor } from "./WorkOrderDueDateEditor";

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

  function handleCreated(created: WorkOrderRow) {
    setData((d) => ({ ...d, workOrders: [created, ...d.workOrders], total: d.total + 1 }));
  }

  function handleUpdated(updated: WorkOrderRow) {
    setData((d) => ({ ...d, workOrders: d.workOrders.map((w) => (w.id === updated.id ? updated : w)) }));
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
              <TableRow>
                <TableHead className="pl-6">Work Order</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead className="text-center">Office</TableHead>
                <TableHead className="text-center">Assigned</TableHead>
                <TableHead className="text-center">Due</TableHead>
                <TableHead className="text-center">Created</TableHead>
                <TableHead className="pr-6 text-center">Status</TableHead>
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

function WorkOrderDesktopRow({ workOrder, onUpdated }: { workOrder: WorkOrderRow; onUpdated: (w: WorkOrderRow) => void }) {
  return (
    <TableRow>
      <TableCell className="max-w-56 pl-6">
        <p className="truncate font-medium">{workOrder.title}</p>
        <p className="text-xs text-muted-foreground">Work order #{workOrder.id}</p>
      </TableCell>
      <TableCell>
        <Link className="text-brand-600 hover:underline" href={`/admin/tickets/${workOrder.ticket_id}`}>Ticket #{workOrder.ticket_id}</Link>
      </TableCell>
      <TableCell className="text-center">{workOrder.assigned_office}</TableCell>
      <TableCell className="text-center"><WorkOrderAssigneeSelect onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
      <TableCell className="text-center"><WorkOrderDueDateEditor onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
      <TableCell className="text-center text-xs text-muted-foreground">{formatDate(workOrder.created_at)}</TableCell>
      <TableCell className="pr-6 text-center"><WorkOrderStatusSelect onUpdated={onUpdated} workOrder={workOrder} /></TableCell>
    </TableRow>
  );
}

function WorkOrderCard({ workOrder, onUpdated }: { workOrder: WorkOrderRow; onUpdated: (w: WorkOrderRow) => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{workOrder.title}</p>
            <p className="font-mono text-xs text-muted-foreground">#{workOrder.id}</p>
          </div>
          <WorkOrderStatusBadge status={workOrder.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link className="text-brand-600 hover:underline" href={`/admin/tickets/${workOrder.ticket_id}`}>Ticket #{workOrder.ticket_id}</Link>
          {" · "}{workOrder.assigned_office}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <WorkOrderStatusSelect onUpdated={onUpdated} workOrder={workOrder} />
          <WorkOrderAssigneeSelect onUpdated={onUpdated} workOrder={workOrder} />
        </div>
        <WorkOrderDueDateEditor onUpdated={onUpdated} workOrder={workOrder} />
      </CardContent>
    </Card>
  );
}
