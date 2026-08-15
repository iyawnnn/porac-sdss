"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import type { AdminAuditActionType, AdminAuditTargetType, PaginatedAdminAudit } from "@/lib/types/admin-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { AdminErrorCard } from "../shared/AdminErrorCard";

const ACTION_LABELS: Record<AdminAuditActionType, string> = {
  admin_created: "Admin created",
  admin_role_updated: "Role/office updated",
  admin_password_changed: "Password changed",
  admin_password_reset: "Password reset",
  ticket_status_advanced: "Ticket status advanced",
  ticket_reassigned: "Ticket reassigned",
  ticket_referral_noted: "Referral recorded",
  ticket_rejected: "Ticket rejected",
  report_moderated: "Report moderated",
  work_order_created: "Work order created",
  work_order_updated: "Work order updated",
  work_order_status_changed: "Work order status changed",
  work_order_completed: "Work order completed",
  work_order_cancelled: "Work order cancelled",
};
const TARGET_LABELS: Record<AdminAuditTargetType, string> = {
  admin: "Admin",
  ticket: "Ticket",
  report: "Report",
  work_order: "Work order",
};
const PAGE_LIMITS = [10, 25, 50, 100] as const;

interface QueryState {
  actionType: string;
  targetType: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

function initialQueryState(query: Record<string, string | undefined>): QueryState {
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit)) ? Number(query.limit) : 25;
  return {
    actionType: query.actionType ?? "",
    targetType: query.targetType ?? "",
    from: query.from ?? "",
    to: query.to ?? "",
    page: Math.max(1, Number(query.page) || 1),
    limit,
  };
}

function buildParams(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(state.page));
  params.set("limit", String(state.limit));
  if (state.actionType) params.set("actionType", state.actionType);
  if (state.targetType) params.set("targetType", state.targetType);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  return params;
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...keep].sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis");
    result.push(p);
    prev = p;
  }
  return result;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ActivityLogWorkspace({
  initialData,
  initialQuery,
}: {
  initialData: PaginatedAdminAudit;
  initialQuery: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<QueryState>(() => initialQueryState(initialQuery));
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
    fetch(`/api/admin/activity-log?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load activity log.");
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

  function resetFilters() {
    setQuery({ actionType: "", targetType: "", from: "", to: "", page: 1, limit: query.limit });
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  const hasActiveFilters = query.actionType !== "" || query.targetType !== "" || query.from !== "" || query.to !== "";
  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="space-y-0.5">
        <h1 className="font-heading text-base font-semibold">Activity Log</h1>
        <p className="text-xs text-muted-foreground">Administrative actions across every office — System Administrator only.</p>
      </div>

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          <Select onValueChange={(v) => updateFilter({ actionType: v === "all" ? "" : v })} value={query.actionType || "all"}>
            <SelectTrigger aria-label="Action type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ targetType: v === "all" ? "" : v })} value={query.targetType || "all"}>
            <SelectTrigger aria-label="Target type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {Object.entries(TARGET_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="From date"
            className="w-auto"
            onChange={(e) => updateFilter({ from: e.target.value })}
            type="date"
            value={query.from}
          />
          <Input
            aria-label="To date"
            className="w-auto"
            onChange={(e) => updateFilter({ to: e.target.value })}
            type="date"
            value={query.to}
          />
          {hasActiveFilters && (
            <Button className="ml-auto" onClick={resetFilters} size="sm" variant="ghost">
              Reset filters
            </Button>
          )}
        </CardContent>

        {error ? (
          <CardContent className="p-4">
            <AdminErrorCard message={error} onRetry={retry} title="Couldn't load the activity log" />
          </CardContent>
        ) : loading ? (
          <CardContent className="divide-y p-0">
            {Array.from({ length: 6 }).map((_, row) => (
              <div className="flex items-center gap-4 px-4 py-3" key={row}>
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        ) : data.events.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ClipboardList aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No activity recorded</p>
            <p className="text-xs text-muted-foreground">
              {hasActiveFilters ? "No events match the current filters." : "Administrative actions will appear here as they happen."}
            </p>
          </CardContent>
        ) : (
          <>
            {/* Desktop table */}
            <CardContent className="hidden min-w-0 p-0 md:block">
              <Table className="[&_td]:py-1.5 [&_th]:h-8">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="pr-6">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="pl-6 text-xs text-muted-foreground whitespace-nowrap">{formatTime(event.created_at)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{event.actor_name}</p>
                        <p className="text-xs text-muted-foreground">{event.actor_office ?? "All Offices"} · {event.actor_role}</p>
                      </TableCell>
                      <TableCell><Badge variant="outline">{ACTION_LABELS[event.action_type]}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{TARGET_LABELS[event.target_type]} #{event.target_id}</TableCell>
                      <TableCell className="pr-6 max-w-72 truncate text-sm" title={event.target_summary}>{event.target_summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>

            {/* Mobile cards */}
            <CardContent className="flex flex-col gap-2 p-3 md:hidden">
              {data.events.map((event) => (
                <Card key={event.id}>
                  <CardContent className="flex flex-col gap-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{ACTION_LABELS[event.action_type]}</Badge>
                      <span className="text-xs text-muted-foreground">{formatTime(event.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium">{event.actor_name} <span className="text-xs font-normal text-muted-foreground">({event.actor_office ?? "All Offices"} · {event.actor_role})</span></p>
                    <p className="text-xs text-muted-foreground">{TARGET_LABELS[event.target_type]} #{event.target_id}</p>
                    <p className="text-sm">{event.target_summary}</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </>
        )}
      </Card>

      {!error && data.events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Showing {from}–{to} of {data.total} events</p>
          <div className="flex flex-wrap items-center gap-3">
            <Select onValueChange={(v) => setQuery((q) => ({ ...q, limit: Number(v), page: 1 }))} value={String(query.limit)}>
              <SelectTrigger aria-label="Rows per page" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_LIMITS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={data.page <= 1}
                    className={data.page <= 1 ? "pointer-events-none opacity-40" : undefined}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (data.page > 1) setQuery((q) => ({ ...q, page: q.page - 1 }));
                    }}
                  />
                </PaginationItem>
                {getPageNumbers(data.page, data.totalPages).map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`e${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === data.page}
                        onClick={(e) => {
                          e.preventDefault();
                          setQuery((q) => ({ ...q, page: p }));
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={data.page >= data.totalPages}
                    className={data.page >= data.totalPages ? "pointer-events-none opacity-40" : undefined}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (data.page < data.totalPages) setQuery((q) => ({ ...q, page: q.page + 1 }));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </div>
  );
}
