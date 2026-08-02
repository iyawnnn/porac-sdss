"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, AlertTriangle, Gauge, MapPin, SearchIcon, SearchXIcon, Ticket as TicketIcon, type LucideIcon } from "lucide-react";
import type { AdminTicketRow, PaginatedTickets } from "@/lib/types/admin-tickets";
import { TICKET_STATUSES, TICKET_CATEGORIES, PAGE_LIMITS, type TicketSort } from "@/lib/types/admin-ticket-constants";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { priorityScoreBandClass } from "@/lib/utils/ui/priority";
import { relativeAge } from "@/lib/utils/ui/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { StatusPill } from "../shared/StatusPill";
import { AdminErrorCard } from "../shared/AdminErrorCard";

interface RecomputeResult {
  updated: number;
  rain1hMm: number;
}

interface Barangay {
  id: number;
  name: string;
}

// Mirrors the URL exactly (all strings) — separate from lib/admin/tickets's
// typed AdminTicketFilters, which is the DB-query shape.
interface QueryState {
  office: string;
  status: string;
  category: string;
  barangayId: string;
  sort: TicketSort;
  search: string;
  page: number;
  limit: number;
}

function initialQueryState(query: Record<string, string | undefined>, sessionOffice?: string): QueryState {
  const office =
    query.office === "all" || query.office === "MEO" || query.office === "MDRRMO"
      ? query.office
      : (sessionOffice ?? "all");
  const status =
    query.status === "all" ||
    query.status === "active" ||
    (TICKET_STATUSES as string[]).includes(query.status ?? "")
      ? (query.status as string)
      : "active";
  const category = (TICKET_CATEGORIES as readonly string[]).includes(query.category ?? "") ? (query.category as string) : "";
  const sort: TicketSort = query.sort === "priority_asc" || query.sort === "newest" ? query.sort : "priority_desc";
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit)) ? Number(query.limit) : 15;

  return {
    office,
    status,
    category,
    barangayId: query.barangayId ?? "",
    sort,
    search: query.search ?? "",
    page: Math.max(1, Number(query.page) || 1),
    limit,
  };
}

function buildParams(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("office", state.office);
  params.set("status", state.status);
  params.set("sort", state.sort);
  params.set("limit", String(state.limit));
  params.set("page", String(state.page));
  if (state.category) params.set("category", state.category);
  if (state.barangayId) params.set("barangayId", state.barangayId);
  if (state.search) params.set("search", state.search);
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

function formatCreatedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const HEAD_CLASS = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export function TicketsWorkspace({
  initialData,
  initialQuery,
  initialRecompute,
  barangays,
  sessionOffice,
}: {
  initialData: PaginatedTickets;
  initialQuery: Record<string, string | undefined>;
  initialRecompute: RecomputeResult;
  barangays: Barangay[];
  sessionOffice?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<QueryState>(() => initialQueryState(initialQuery, sessionOffice));
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState(initialData);
  const [, setRecompute] = useState(initialRecompute);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);

  const skipFetchRef = useRef(true);
  const skipSearchDebounceRef = useRef(true);

  // Debounce the search box into query.search (and reset to page 1) rather
  // than refetching on every keystroke.
  useEffect(() => {
    if (skipSearchDebounceRef.current) {
      skipSearchDebounceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setQuery((q) => ({ ...q, search: searchInput.trim(), page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
    fetch(`/api/admin/tickets?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setRecompute(json.recompute);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tickets.");
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
    setSearchInput("");
    setQuery({ office: sessionOffice ?? "all", status: "active", category: "", barangayId: "", sort: "priority_desc", search: "", page: 1, limit: query.limit });
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  const hasActiveFilters =
    query.office !== (sessionOffice ?? "all") ||
    query.status !== "active" ||
    query.category !== "" ||
    query.barangayId !== "" ||
    query.search !== "" ||
    query.sort !== "priority_desc";

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);
  const returnQuery = buildParams(query).toString();
  const sortedBarangays = [...barangays].sort((a, b) => a.name.localeCompare(b.name));

  // KPI row is derived entirely from the page's own already-loaded data (no
  // extra fetches): data.total is the server-computed count across all
  // filtered results, everything else is scoped to the current page of rows.
  const activeCount = data.tickets.filter((t) => t.status === "Reported" || t.status === "Under Review" || t.status === "In Progress").length;
  const highPriorityCount = data.tickets.filter((t) => getUrgencyBadgeConfig(t.priority_score).level === "HIGH").length;
  const scoredTickets = data.tickets.map((t) => t.priority_score).filter((s): s is number => s !== null);
  const avgUrgencyScore = scoredTickets.length ? Math.round(scoredTickets.reduce((sum, s) => sum + s, 0) / scoredTickets.length) : null;
  const activeBarangayCount = new Set(data.tickets.map((t) => t.barangay_id)).size;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="space-y-0.5">
        <h1 className="font-heading text-base font-semibold">Ticket Queue</h1>
        <p className="text-xs text-muted-foreground">Current workload summary</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={TicketIcon} label="Total Tickets" tint="bg-slate-100 text-slate-600" value={data.total.toLocaleString()} />
        <KpiCard icon={Activity} label="Active Tickets" tint="bg-blue-50 text-blue-600" value={activeCount.toLocaleString()} />
        <KpiCard icon={AlertTriangle} label="High Priority" tint="bg-red-50 text-red-600" value={highPriorityCount.toLocaleString()} />
        <KpiCard icon={Gauge} label="Avg. Urgency Score" tint="bg-amber-50 text-amber-600" value={avgUrgencyScore === null ? "—" : String(avgUrgencyScore)} />
        <KpiCard icon={MapPin} label="Active Barangays" tint="bg-emerald-50 text-emerald-600" value={activeBarangayCount.toLocaleString()} />
      </div>

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-[380px]">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search tickets"
              className="pl-8"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by ticket ID, title, or barangay..."
              type="search"
              value={searchInput}
            />
          </div>
          <Select onValueChange={(v) => updateFilter({ office: v })} value={query.office}>
            <SelectTrigger aria-label="Office"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offices</SelectItem>
              <SelectItem value="MEO">MEO</SelectItem>
              <SelectItem value="MDRRMO">MDRRMO</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ status: v })} value={query.status}>
            <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active / Open</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ category: v === "all" ? "" : v })} value={query.category || "all"}>
            <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ barangayId: v === "all" ? "" : v })} value={query.barangayId || "all"}>
            <SelectTrigger aria-label="Barangay"><SelectValue /></SelectTrigger>
            <SelectContent className="min-w-56">
              <SelectItem value="all">All barangays</SelectItem>
              {sortedBarangays.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ sort: v as TicketSort })} value={query.sort}>
            <SelectTrigger aria-label="Sort tickets"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority_desc">Urgency: highest first</SelectItem>
              <SelectItem value="priority_asc">Urgency: lowest first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button className="ml-auto" onClick={resetFilters} size="sm" variant="ghost">
              Reset filters
            </Button>
          )}
        </CardContent>

        {/* Desktop table */}
        <CardContent className="hidden min-w-0 p-0 md:block">
          <Table className="[&_td]:py-1.5 [&_th]:h-8">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className={`${HEAD_CLASS} pl-6`}>Ticket</TableHead>
                <TableHead className={HEAD_CLASS}>Category</TableHead>
                <TableHead className={HEAD_CLASS}>Barangay</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Members</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Urgency Score</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Urgency</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Office</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Status</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Created</TableHead>
                <TableHead className={`${HEAD_CLASS} pr-6 text-end`}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-4" colSpan={10}>
                    <AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh tickets" />
                  </TableCell>
                </TableRow>
              ) : loading ? (
                <SkeletonRows count={data.limit} />
              ) : data.tickets.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-10 text-center" colSpan={10}>
                    <EmptyState />
                  </TableCell>
                </TableRow>
              ) : (
                data.tickets.map((ticket) => <TicketRow key={ticket.id} returnQuery={returnQuery} ticket={ticket} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {error ? (
          <AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh tickets" />
        ) : loading ? (
          Array.from({ length: Math.min(data.limit, 8) }).map((_, i) => <TicketCardSkeleton key={i} />)
        ) : data.tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-1 p-8 text-center">
              <EmptyState />
            </CardContent>
          </Card>
        ) : (
          data.tickets.map((ticket) => <TicketCard key={ticket.id} returnQuery={returnQuery} ticket={ticket} />)
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{data.total === 0 ? "No tickets" : `Showing ${from}–${to} of ${data.total} tickets`}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Select onValueChange={(v) => setQuery((q) => ({ ...q, limit: Number(v), page: 1 }))} value={String(query.limit)}>
            <SelectTrigger aria-label="Rows per page" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
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
    </div>
  );
}

function KpiCard({ icon: Icon, label, tint, value }: { icon: LucideIcon; label: string; tint: string; value: string }) {
  return (
    <Card className="py-0 shadow-xs">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon aria-hidden="true" className="size-4.5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground" title={label}>{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <>
      <SearchXIcon aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No tickets match this filter.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try widening your search or resetting filters.</p>
    </>
  );
}

function TicketRow({ ticket, returnQuery }: { ticket: AdminTicketRow; returnQuery: string }) {
  const detailHref = `/admin/tickets/${ticket.id}?from=${encodeURIComponent(`/admin/tickets?${returnQuery}`)}`;
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
  return (
    <TableRow>
      <TableCell className="max-w-56 pl-6">
        <Link className="block truncate font-medium hover:underline" href={detailHref} title={ticket.title ?? undefined}>
          {ticket.title ?? `Ticket #${ticket.id}`}
        </Link>
        <div className="text-xs text-muted-foreground">
          Ticket <span className="font-mono">#{ticket.id}</span>
        </div>
      </TableCell>
      <TableCell>{ticket.category}</TableCell>
      <TableCell className="max-w-40">
        <span className="block truncate" title={ticket.barangay_name}>
          {ticket.barangay_name}
        </span>
      </TableCell>
      <TableCell className="text-center font-mono tabular-nums">{ticket.member_count}</TableCell>
      <TableCell className="text-center">
        <Badge className={priorityScoreBandClass(ticket.priority_score)} variant="outline">
          <span className="font-mono tabular-nums">{ticket.priority_score ?? "—"}</span>
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge className={urgencyBadge.className} variant="outline">
          {urgencyBadge.label}
        </Badge>
      </TableCell>
      <TableCell className="text-center">{ticket.assigned_office}</TableCell>
      <TableCell className="text-center">
        <StatusPill status={ticket.status} />
      </TableCell>
      <TableCell className="text-center text-xs">
        <div>{formatCreatedDate(ticket.created_at)}</div>
        <div className="text-muted-foreground">{relativeAge(ticket.created_at, ticket.status)}</div>
      </TableCell>
      <TableCell className="pr-6 text-end">
        <Button asChild size="sm" variant="outline">
          <Link href={detailHref}>View ticket</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TicketCard({ ticket, returnQuery }: { ticket: AdminTicketRow; returnQuery: string }) {
  const detailHref = `/admin/tickets/${ticket.id}?from=${encodeURIComponent(`/admin/tickets?${returnQuery}`)}`;
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link className="block truncate font-medium hover:underline" href={detailHref} title={ticket.title ?? undefined}>
              {ticket.title ?? `Ticket #${ticket.id}`}
            </Link>
            <p className="font-mono text-xs text-muted-foreground">
              #{ticket.id} {"·"} {ticket.category}
            </p>
          </div>
          <StatusPill status={ticket.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {ticket.barangay_name} {"·"} {ticket.assigned_office} {"·"} {ticket.member_count} member{ticket.member_count === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={priorityScoreBandClass(ticket.priority_score)} variant="outline">
            <span className="font-mono tabular-nums">{ticket.priority_score ?? "—"}</span>
          </Badge>
          <Badge className={urgencyBadge.className} variant="outline">
            {urgencyBadge.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{relativeAge(ticket.created_at, ticket.status)}</span>
        </div>
        <Button asChild className="self-start" size="sm" variant="outline">
          <Link href={detailHref}>View ticket</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.min(count, 15) }).map((_, i) => (
        <TableRow className="hover:bg-transparent" key={i}>
          {Array.from({ length: 10 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function TicketCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-7 w-24" />
      </CardContent>
    </Card>
  );
}
