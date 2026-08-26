"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ActivityIcon,
  CloudRainIcon,
  DownloadIcon,
  GaugeIcon,
  MapPinIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  BulkActionResult,
  PaginatedTickets,
  SavedView,
  TicketViewCounts,
} from "@/lib/types/admin-tickets";
import {
  ALL_TICKET_CATEGORIES,
  PAGE_LIMITS,
  TICKET_STATUSES,
  type TicketSort,
} from "@/lib/types/admin-ticket-constants";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AdminErrorCard } from "../shared/AdminErrorCard";
import type { QueueColumnKey, QueueColumnVisibility, QueueDensity } from "./queue/columns";
import type { QueueFilterValues } from "./queue/QueueFiltersPopover";
import { QueueBulkBar } from "./queue/QueueBulkBar";
import { QueuePagination } from "./queue/QueuePagination";
import { QueueTable } from "./queue/QueueTable";
import { QueueToolbar, type FilterChip } from "./queue/QueueToolbar";
import {
  buildBuiltInViews,
  QueueViewTabs,
  type BuiltInViewKey,
} from "./queue/QueueViewTabs";
import { useQueueKeyboard } from "./queue/useQueueKeyboard";
import { useQueueSelection } from "./queue/useQueueSelection";

interface RecomputeResult {
  updated: number;
  rain1hMm: number;
}

interface Barangay {
  id: number;
  name: string;
}

// Mirrors the URL exactly (all strings) — separate from the API's typed
// AdminTicketFilters, which is the DB-query shape.
interface QueryState {
  office: string;
  status: string;
  category: string;
  barangayId: string;
  urgency: string;
  sort: TicketSort;
  search: string;
  disputed: boolean;
  page: number;
  limit: number;
}

function initialQueryState(
  query: Record<string, string | undefined>,
  sessionOffice?: string,
): QueryState {
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
  const category = (ALL_TICKET_CATEGORIES as readonly string[]).includes(query.category ?? "")
    ? (query.category as string)
    : "";
  const urgency =
    query.urgency === "Low" || query.urgency === "Medium" || query.urgency === "High"
      ? query.urgency
      : "";
  const sort: TicketSort =
    query.sort === "priority_asc" || query.sort === "newest" ? query.sort : "priority_desc";
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit))
    ? Number(query.limit)
    : 15;

  return {
    office,
    status,
    category,
    barangayId: query.barangayId ?? "",
    urgency,
    sort,
    search: query.search ?? "",
    disputed: query.disputed === "true",
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
  if (state.urgency) params.set("urgency", state.urgency);
  if (state.search) params.set("search", state.search);
  if (state.disputed) params.set("disputed", "true");
  return params;
}

// A built-in tab is "active" only when the filter state is EXACTLY what that
// tab sets — never a loose match. A tab underlined while an extra category or
// barangay filter is also narrowing the list would misreport what is on screen,
// so an ad-hoc combination underlines nothing.
function matchBuiltInView(state: QueryState, defaultOffice: string): BuiltInViewKey | null {
  if (state.status !== "active" || state.category || state.barangayId || state.search) return null;
  if (state.disputed) return state.urgency || state.office !== defaultOffice ? null : "disputed";
  if (state.urgency === "High") return state.office !== defaultOffice ? null : "highUrgency";
  if (state.urgency) return null;
  if (state.office === "MEO" && defaultOffice !== "MEO") return "meo";
  if (state.office === "MDRRMO" && defaultOffice !== "MDRRMO") return "mdrrmo";
  if (state.office === defaultOffice) return "allActive";
  return null;
}

export function TicketsWorkspace({
  initialData,
  initialQuery,
  initialRecompute,
  initialViewCounts,
  initialSavedViews,
  barangays,
  sessionOffice,
  isSystemAdmin = false,
}: {
  initialData: PaginatedTickets;
  initialQuery: Record<string, string | undefined>;
  initialRecompute: RecomputeResult;
  initialViewCounts: TicketViewCounts;
  initialSavedViews: SavedView[];
  barangays: Barangay[];
  sessionOffice?: string;
  isSystemAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultOffice = sessionOffice ?? "all";

  const [query, setQuery] = useState<QueryState>(() =>
    initialQueryState(initialQuery, sessionOffice),
  );
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState(initialData);
  const [recompute, setRecompute] = useState(initialRecompute);
  const [viewCounts, setViewCounts] = useState(initialViewCounts);
  const [savedViews, setSavedViews] = useState(initialSavedViews);
  const [activeSavedViewId, setActiveSavedViewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);

  const [columnVisibility, setColumnVisibility] = useState<QueueColumnVisibility>({});
  const [density, setDensity] = useState<QueueDensity>("comfortable");

  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ action: string; result: BulkActionResult } | null>(
    null,
  );
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");

  const skipFetchRef = useRef(true);
  const skipSearchDebounceRef = useRef(true);

  // Debounce the search box into query.search (and reset to page 1) rather than
  // refetching on every keystroke.
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
        // The tab counts are recounted server-side on every list fetch, so a
        // bulk action that moves tickets out of a tab updates that tab's number
        // in the same round trip as the rows.
        if (json.viewCounts) setViewCounts(json.viewCounts);
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

  const visibleIds = useMemo(() => data.tickets.map((t) => t.id), [data.tickets]);
  const selection = useQueueSelection(visibleIds);
  const { selectedIds, clear: clearSelection } = selection;

  const returnQuery = buildParams(query).toString();
  const detailHref = useCallback(
    (id: number) =>
      `/admin/tickets/${id}?from=${encodeURIComponent(`/admin/tickets?${returnQuery}`)}`,
    [returnQuery],
  );

  const openTicket = useCallback(
    (id: number) => router.push(detailHref(id)),
    [router, detailHref],
  );
  const { focusedId, setFocusedId } = useQueueKeyboard({
    ids: visibleIds,
    onToggleSelect: selection.toggle,
    onOpen: openTicket,
    // Disabled while a bulk action is in flight so J/K cannot move the ring
    // under a selection that is mid-mutation.
    enabled: !bulkBusy,
  });

  function updateFilter(patch: Partial<QueryState>) {
    setActiveSavedViewId(null);
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  // --- View tabs -----------------------------------------------------------
  const builtInViews = buildBuiltInViews(viewCounts, { showOfficeTabs: isSystemAdmin });
  const activeViewKey = activeSavedViewId === null ? matchBuiltInView(query, defaultOffice) : null;

  function selectBuiltInView(key: BuiltInViewKey) {
    setSearchInput("");
    setActiveSavedViewId(null);
    setQuery((q) => ({
      ...q,
      office: key === "meo" ? "MEO" : key === "mdrrmo" ? "MDRRMO" : defaultOffice,
      status: "active",
      category: "",
      barangayId: "",
      urgency: key === "highUrgency" ? "High" : "",
      search: "",
      disputed: key === "disputed",
      page: 1,
    }));
  }

  function selectSavedView(view: SavedView) {
    // Replayed through the same parser the address bar uses, so a stored
    // office= is still clamped by resolveOfficeScope server-side — a saved view
    // is a bookmark, never a grant.
    const parsed = initialQueryState(
      Object.fromEntries(new URLSearchParams(view.query).entries()),
      sessionOffice,
    );
    setSearchInput(parsed.search);
    setQuery({ ...parsed, page: 1 });
    setActiveSavedViewId(view.id);
  }

  async function saveCurrentView() {
    const name = saveViewName.trim();
    if (!name) return;
    setSaveViewOpen(false);
    setSaveViewName("");
    try {
      const res = await fetch("/api/admin/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query: buildParams(query).toString() }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const saved: SavedView = await res.json();
      setSavedViews((views) => {
        const rest = views.filter((v) => v.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.position - b.position || a.id - b.id);
      });
      setActiveSavedViewId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this view.");
    }
  }

  async function deleteSavedView(view: SavedView) {
    setSavedViews((views) => views.filter((v) => v.id !== view.id));
    if (activeSavedViewId === view.id) setActiveSavedViewId(null);
    try {
      await fetch(`/api/admin/saved-views/${view.id}`, { method: "DELETE" });
    } catch {
      // The tab is already gone from the strip; a failed delete resurfaces on
      // the next full page load rather than snapping back mid-interaction.
    }
  }

  // --- Bulk actions --------------------------------------------------------
  // Every bulk call refetches the list afterwards rather than patching rows in
  // place: the server may have skipped some tickets, recomputed urgency, and
  // moved rows out of the current filter entirely. Re-reading is the only way
  // the rows, the tab counts and the KPI row stay consistent with each other.
  const runBulk = useCallback(
    async (action: string, url: string, body: Record<string, unknown>) => {
      setBulkBusy(true);
      setBulkResult(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ticketIds: selectedIds }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const result: BulkActionResult = await res.json();
        setBulkResult({ action, result });
        clearSelection();
        setRefetchNonce((n) => n + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The bulk action failed.");
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, clearSelection],
  );

  // A single row's status chevron reuses the bulk endpoint with one id rather
  // than the single-ticket route: advanceStatus for a non-Resolved transition
  // needs no photo, and going through the same path means the row menu and the
  // bulk bar can never disagree about what "advance" means.
  const advanceOne = useCallback(
    async (id: number) => {
      setBulkBusy(true);
      setBulkResult(null);
      try {
        const res = await fetch("/api/admin/tickets/bulk/advance-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketIds: [id] }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const result: BulkActionResult = await res.json();
        setBulkResult({ action: "Advance status", result });
        setRefetchNonce((n) => n + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not advance this ticket.");
      } finally {
        setBulkBusy(false);
      }
    },
    [],
  );

  // --- Derived display -----------------------------------------------------
  const filters: QueueFilterValues = {
    office: query.office,
    status: query.status,
    category: query.category,
    barangayId: query.barangayId,
    urgency: query.urgency,
    disputed: query.disputed,
  };

  const barangayName = barangays.find((b) => String(b.id) === query.barangayId)?.name;
  const filterChips: FilterChip[] = [
    query.office !== defaultOffice ? { key: "office", label: `Office: ${query.office}` } : null,
    query.status !== "active" ? { key: "status", label: `Status: ${query.status === "all" ? "All" : query.status}` } : null,
    query.category ? { key: "category", label: `Category: ${query.category}` } : null,
    query.barangayId ? { key: "barangayId", label: `Barangay: ${barangayName ?? query.barangayId}` } : null,
    query.urgency ? { key: "urgency", label: `Urgency: ${query.urgency}` } : null,
    query.disputed ? { key: "disputed", label: "Disputed only" } : null,
  ].filter((chip): chip is FilterChip => chip !== null);

  function removeChip(key: string) {
    switch (key) {
      case "office":
        return updateFilter({ office: defaultOffice });
      case "status":
        return updateFilter({ status: "active" });
      case "category":
        return updateFilter({ category: "" });
      case "barangayId":
        return updateFilter({ barangayId: "" });
      case "urgency":
        return updateFilter({ urgency: "" });
      case "disputed":
        return updateFilter({ disputed: false });
    }
  }

  function clearAllFilters() {
    setSearchInput("");
    setActiveSavedViewId(null);
    setQuery((q) => ({
      ...q,
      office: defaultOffice,
      status: "active",
      category: "",
      barangayId: "",
      urgency: "",
      search: "",
      disputed: false,
      page: 1,
    }));
  }

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);

  // KPI row is derived from the page's own already-loaded data (no extra
  // fetches): data.total is the server-computed count across all filtered
  // results, everything else is scoped to the current page of rows — which is
  // why each tile carries a note saying which of the two it is.
  const activeCount = data.tickets.filter(
    (t) => t.status === "Reported" || t.status === "Under Review" || t.status === "In Progress",
  ).length;
  const highUrgencyCount = data.tickets.filter(
    (t) => getUrgencyBadgeConfig(t.priority_score).level === "HIGH",
  ).length;
  const scored = data.tickets.map((t) => t.priority_score).filter((s): s is number => s !== null);
  const avgUrgency = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)
    : null;
  const barangayCount = new Set(data.tickets.map((t) => t.barangay_id)).size;

  const exportParams = buildParams(query);
  const selectionExportParams = new URLSearchParams(exportParams);
  selectionExportParams.set("ids", selectedIds.join(","));

  const sortLabel =
    query.sort === "newest" ? "newest first" : query.sort === "priority_asc" ? "lowest hazard urgency" : "hazard urgency";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">Ticket Queue</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {data.total.toLocaleString()} ticket{data.total === 1 ? "" : "s"} across{" "}
            {barangayCount} barangay{barangayCount === 1 ? "" : "s"} &middot; sorted by {sortLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* initialRecompute was fetched and discarded before this rebuild. It
              is the freshest thing on the page — the rain figure every urgency
              score was just recomputed against — and belongs beside the data it
              explains rather than in the layout's app header, which has no
              access to it. */}
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-subtle)] px-2.5 text-xs font-medium text-primary">
            <CloudRainIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Rain {recompute.rain1hMm.toFixed(1)} mm/h &middot; {recompute.updated} urgency score
            {recompute.updated === 1 ? "" : "s"} recomputed
          </span>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/reports/tickets.csv?${exportParams.toString()}`}>
              <DownloadIcon />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <QueueViewTabs
        activeKey={activeViewKey}
        activeSavedViewId={activeSavedViewId}
        onDeleteSaved={deleteSavedView}
        onSaveCurrent={() => setSaveViewOpen(true)}
        onSelectBuiltIn={selectBuiltInView}
        onSelectSaved={selectSavedView}
        savedViews={savedViews}
        views={builtInViews}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={TicketIcon} label="Total tickets" note="all filters" value={data.total.toLocaleString()} />
        <KpiCard icon={ActivityIcon} label="Active" note="on this page" value={activeCount.toLocaleString()} />
        <KpiCard icon={TriangleAlertIcon} label="High urgency" note="&ge; 70" value={highUrgencyCount.toLocaleString()} />
        <KpiCard icon={GaugeIcon} label="Avg. urgency" note="of 100" value={avgUrgency === null ? "—" : String(avgUrgency)} />
        <KpiCard icon={MapPinIcon} label="Barangays" note="affected" value={barangayCount.toLocaleString()} />
      </div>

      {error && !loading && (
        <AdminErrorCard
          message="Something went wrong while updating the queue."
          onRetry={retry}
          title="Queue action failed"
          detail={error}
        />
      )}

      {/* The Queue surface: a plain white bordered card at 12px radius, not the
          dashboard's gray-frame + CardBodyPanel idiom. See docs/design-system.md
          §5.7 — the queue's toolbar, selection bar, header strip and footer are
          four stacked bands that each need their own fill, and a gray frame
          around them reads as a fifth. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <QueueToolbar
          activeFilterCount={filterChips.length}
          barangays={barangays}
          columnVisibility={columnVisibility}
          density={density}
          filterChips={filterChips}
          filters={filters}
          isSystemAdmin={isSystemAdmin}
          onClearAll={clearAllFilters}
          onDensityChange={setDensity}
          onFilterChange={(patch) => updateFilter(patch)}
          onRemoveChip={removeChip}
          onSearchInput={setSearchInput}
          onSortChange={(sort) => updateFilter({ sort })}
          onToggleColumn={(key: QueueColumnKey) =>
            setColumnVisibility((v) => ({ ...v, [key]: v[key] === false }))
          }
          searchInput={searchInput}
          sessionOffice={sessionOffice}
          sort={query.sort}
        />

        {selectedIds.length > 0 && (
          <QueueBulkBar
            busy={bulkBusy}
            exportHref={`/api/admin/reports/tickets.csv?${selectionExportParams.toString()}`}
            onAdvanceStatus={() =>
              runBulk("Advance status", "/api/admin/tickets/bulk/advance-status", {})
            }
            onClearSelection={clearSelection}
            onCreateWorkOrders={(input) =>
              runBulk("Create work orders", "/api/admin/work-orders/bulk", {
                title: input.title,
                dueDate: input.dueDate || undefined,
              })
            }
            onDismissResult={() => setBulkResult(null)}
            onReassign={(toOffice) =>
              runBulk("Assign office", "/api/admin/tickets/bulk/reassign", { toOffice })
            }
            result={bulkResult}
            selectedIds={selectedIds}
          />
        )}

        {selectedIds.length === 0 && bulkResult && (
          <div className="flex flex-wrap items-start gap-3 border-b border-border bg-muted px-3.5 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {bulkResult.action}: {bulkResult.result.ok.length} updated
                {bulkResult.result.skipped.length > 0 &&
                  `, ${bulkResult.result.skipped.length} skipped`}
              </p>
              {bulkResult.result.skipped.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {bulkResult.result.skipped.map((skip) => (
                    <li key={skip.id}>
                      <span className="font-mono">#{skip.id}</span> {skip.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button className="h-7 px-2 text-xs" onClick={() => setBulkResult(null)} size="sm" variant="ghost">
              Dismiss
            </Button>
          </div>
        )}

        <QueueTable
          columnVisibility={columnVisibility}
          density={density}
          detailHref={(ticket) => detailHref(ticket.id)}
          error={error && loading === false && data.tickets.length === 0 ? error : null}
          focusedId={focusedId}
          headerState={selection.headerState}
          isSelected={selection.isSelected}
          loading={loading}
          onAdvanceStatus={advanceOne}
          onFocusRow={setFocusedId}
          onRetry={retry}
          onToggleAll={selection.toggleAll}
          onToggleSelect={selection.toggle}
          skeletonRows={data.limit}
          tickets={data.tickets}
        />

        <QueuePagination
          from={from}
          limit={data.limit}
          onLimitChange={(limit) => setQuery((q) => ({ ...q, limit, page: 1 }))}
          onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
          page={data.page}
          to={to}
          total={data.total}
          totalPages={data.totalPages}
        />
      </div>

      <Dialog onOpenChange={setSaveViewOpen} open={saveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Saves the current filters, sort and page size as a personal tab. Only you can see it.
              Saving over an existing name replaces it.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="View name"
            maxLength={40}
            onChange={(e) => setSaveViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrentView();
            }}
            placeholder="e.g. Poblacion drainage"
            value={saveViewName}
          />
          <DialogFooter>
            <Button onClick={() => setSaveViewOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={!saveViewName.trim()} onClick={saveCurrentView}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// White bordered card at 12px radius with an uppercase micro-label — the Queue
// surface treatment, deliberately not the dashboard's gray-frame KPI tile (see
// docs/design-system.md §5.8). The icon is aria-hidden beside a visible label,
// which is what lets it use --brand (2.61:1) rather than the AA-safe
// --brand-solid. Bare icon, never an icon-in-a-colored-tile (§5.6/§7). No
// sparkline and no delta: the queue has no trend data and must not imply one.
//
// `note` is not decoration — the tiles mix a server-wide figure (Total tickets)
// with page-scoped ones, and without the note the row would read as five
// comparable numbers when only one spans every page.
function KpiCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground"
          title={label}
        >
          {label}
        </span>
        <Icon aria-hidden="true" className="size-[15px] shrink-0 text-[var(--brand)]" strokeWidth={1.75} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] leading-8 font-semibold tracking-[-0.03em] tabular-nums">
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}
