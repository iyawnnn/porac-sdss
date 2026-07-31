"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AdminTicketRow, PaginatedTickets } from "@/lib/types/admin-tickets";
import { TICKET_STATUSES, PAGE_LIMITS, type TicketSort } from "@/lib/types/admin-ticket-constants";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { priorityScoreBandClass } from "@/lib/utils/ui/priority";
import { relativeAge } from "@/lib/utils/ui/time";
import { StatusPill } from "../shared/StatusPill";

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
  const sort: TicketSort = query.sort === "priority_asc" || query.sort === "newest" ? query.sort : "priority_desc";
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit)) ? Number(query.limit) : 15;

  return {
    office,
    status,
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

const TOOLBAR_SELECT = "rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-sm text-ink-700";
const TH_CLASS = "h-10 px-3 text-xs font-medium uppercase tracking-wide text-ink-500";

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
  const [recompute, setRecompute] = useState(initialRecompute);
  const [loading, setLoading] = useState(false);

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
    fetch(`/api/admin/tickets?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setRecompute(json.recompute);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, pathname, router]);

  function updateFilter(patch: Partial<QueryState>) {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  function resetFilters() {
    setSearchInput("");
    setQuery({ office: sessionOffice ?? "all", status: "active", barangayId: "", sort: "priority_desc", search: "", page: 1, limit: query.limit });
  }

  const hasActiveFilters =
    query.office !== (sessionOffice ?? "all") ||
    query.status !== "active" ||
    query.barangayId !== "" ||
    query.search !== "" ||
    query.sort !== "priority_desc";

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-ink-900">Ticket Queue</h1>
        <p className="text-xs text-ink-400">
          Recomputed just now — rain: {recompute.rain1hMm}mm/h, {recompute.updated} active ticket(s)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white/90 p-3 shadow-sm backdrop-blur-md">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by ticket ID, title, or barangay..."
          aria-label="Search tickets"
          className="min-w-[220px] flex-1 rounded-md border border-slate-200/80 bg-white px-3 py-1.5 text-sm text-ink-700 placeholder:text-ink-400"
        />
        <select
          value={query.office}
          onChange={(e) => updateFilter({ office: e.target.value })}
          className={TOOLBAR_SELECT}
          aria-label="Office"
        >
          <option value="all">All offices</option>
          <option value="MEO">MEO</option>
          <option value="MDRRMO">MDRRMO</option>
        </select>
        <select
          value={query.status}
          onChange={(e) => updateFilter({ status: e.target.value })}
          className={TOOLBAR_SELECT}
          aria-label="Status"
        >
          <option value="active">Active / Open</option>
          <option value="all">All statuses</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={query.barangayId}
          onChange={(e) => updateFilter({ barangayId: e.target.value })}
          className={TOOLBAR_SELECT}
          aria-label="Barangay"
        >
          <option value="">All barangays</option>
          {barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={query.sort}
          onChange={(e) => updateFilter({ sort: e.target.value as TicketSort })}
          className={TOOLBAR_SELECT}
          aria-label="Sort tickets"
        >
          <option value="priority_desc">Priority: highest first</option>
          <option value="priority_asc">Priority: lowest first</option>
          <option value="newest">Newest first</option>
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-500 hover:bg-canvas"
          >
            Reset filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line-200 bg-surface">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line-200 text-left">
              <th className={TH_CLASS}>ID</th>
              <th className={TH_CLASS}>Category</th>
              <th className={TH_CLASS}>Barangay</th>
              <th className={`${TH_CLASS} text-right`}>Members</th>
              <th className={`${TH_CLASS} text-right`}>Priority</th>
              <th className={TH_CLASS}>Urgency</th>
              <th className={TH_CLASS}>Office</th>
              <th className={TH_CLASS}>Status</th>
              <th className={TH_CLASS}>Created</th>
              <th className={TH_CLASS}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows count={data.limit} />
            ) : data.tickets.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-10 text-center">
                  <p className="text-sm font-medium text-ink-700">No tickets match this filter.</p>
                  <p className="mt-1 text-xs text-ink-400">Try widening your search or resetting filters.</p>
                </td>
              </tr>
            ) : (
              data.tickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} returnQuery={buildParams(query).toString()} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-500">
        <p>
          {data.total === 0 ? "No tickets" : `Showing ${from}–${to} of ${data.total} tickets`}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={query.limit}
            onChange={(e) => setQuery((q) => ({ ...q, limit: Number(e.target.value), page: 1 }))}
            className={TOOLBAR_SELECT}
            aria-label="Rows per page"
          >
            {PAGE_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            className="rounded-md border border-line-200 px-3 py-1.5 font-medium text-ink-700 disabled:opacity-40"
          >
            Previous
          </button>
          {getPageNumbers(data.page, data.totalPages).map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e${i}`} className="px-1 text-ink-400">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setQuery((q) => ({ ...q, page: p }))}
                aria-current={p === data.page ? "page" : undefined}
                className={`h-8 w-8 rounded-md text-sm font-medium ${
                  p === data.page ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-canvas"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            disabled={data.page >= data.totalPages}
            onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            className="rounded-md border border-line-200 px-3 py-1.5 font-medium text-ink-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </main>
  );
}

function TicketRow({ ticket, returnQuery }: { ticket: AdminTicketRow; returnQuery: string }) {
  const detailHref = `/admin/tickets/${ticket.id}?from=${encodeURIComponent(`/admin/tickets?${returnQuery}`)}`;
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
  return (
    <tr className="h-11 border-b border-line-100 hover:bg-slate-50/80">
      <td className="px-3 font-mono text-ink-700">
        <Link href={detailHref} className="text-brand-600 hover:text-brand-700 hover:underline">
          #{ticket.id}
        </Link>
      </td>
      <td className="px-3">{ticket.category}</td>
      <td className="px-3">{ticket.barangay_name}</td>
      <td className="px-3 text-right font-mono tabular-nums text-ink-700">{ticket.member_count}</td>
      <td className="px-3 text-right">
        <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${priorityScoreBandClass(ticket.priority_score)}`}>
          {ticket.priority_score ?? "—"}
        </span>
      </td>
      <td className="px-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${urgencyBadge.className}`}>{urgencyBadge.label}</span>
      </td>
      <td className="px-3 text-ink-700">{ticket.assigned_office}</td>
      <td className="px-3">
        <StatusPill status={ticket.status} />
      </td>
      <td className="px-3 font-mono text-xs text-ink-500">
        <div>{new Date(ticket.created_at).toLocaleDateString()}</div>
        <div className="text-ink-400">{relativeAge(ticket.created_at, ticket.status)}</div>
      </td>
      <td className="px-3 text-right">
        <Link
          href={detailHref}
          className="rounded-md border border-line-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-canvas"
        >
          View ticket
        </Link>
      </td>
    </tr>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.min(count, 15) }).map((_, i) => (
        <tr key={i} className="h-11 border-b border-line-100">
          {Array.from({ length: 10 }).map((__, j) => (
            <td key={j} className="px-3">
              <div className="h-3.5 w-full max-w-[8rem] animate-pulse rounded bg-line-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
