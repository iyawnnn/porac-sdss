"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BanIcon,
  ClockIcon,
  CircleCheckIcon,
  DownloadIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type {
  ModerationAction,
  ModerationQueueRow,
  ModerationStats,
  PaginatedModeration,
} from "@/lib/types/admin-moderation";
import { MODERATION_STATUSES, FLAG_TYPES } from "@/lib/types/admin-moderation";
import type { SavedView } from "@/lib/types/admin-tickets";
import {
  ALL_TICKET_CATEGORIES,
  PAGE_LIMITS,
  DEFAULT_PAGE_LIMIT,
} from "@/lib/types/admin-ticket-constants";
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
import { FLAG_TYPE_LABELS, moderationStatusLabel } from "./flagText";
import {
  type FlaggedColumnKey,
  type FlaggedColumnVisibility,
  type FlaggedDensity,
} from "./queue/columns";
import { FlaggedBulkBar, type BulkModerationResult } from "./queue/FlaggedBulkBar";
import type { FlaggedFilterValues } from "./queue/FlaggedFiltersPopover";
import { FlaggedPagination } from "./queue/FlaggedPagination";
import { FlaggedReviewDrawer } from "./queue/FlaggedReviewDrawer";
import { FlaggedTable } from "./queue/FlaggedTable";
import { FlaggedToolbar, type FilterChip } from "./queue/FlaggedToolbar";
import {
  buildBuiltInFlaggedViews,
  FlaggedViewTabs,
  type BuiltInFlaggedViewKey,
} from "./queue/FlaggedViewTabs";
import { useFlaggedKeyboard } from "./queue/useFlaggedKeyboard";
import { useFlaggedSelection } from "./queue/useFlaggedSelection";

interface Barangay {
  id: number;
  name: string;
}

// Mirrors the URL exactly (all strings) — same convention as
// TicketsWorkspace.tsx's QueryState.
interface QueryState {
  office: string;
  status: string;
  category: string;
  barangayId: string;
  flag: string;
  search: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

// Which surface this page's saved views belong to. The Ticket Queue passes
// nothing and gets 'tickets'; without this the two strips would share one list
// and a queue preset would replay `urgency=High` against a parser that has no
// such filter.
const SAVED_VIEW_SURFACE = "flagged";

function initialQueryState(
  query: Record<string, string | undefined>,
  sessionOffice?: string,
): QueryState {
  const office =
    query.office === "all" || query.office === "MEO" || query.office === "MDRRMO"
      ? query.office
      : (sessionOffice ?? "all");
  const status =
    query.status === "all" || (MODERATION_STATUSES as string[]).includes(query.status ?? "")
      ? (query.status as string)
      : "pending";
  const category = (ALL_TICKET_CATEGORIES as readonly string[]).includes(query.category ?? "")
    ? (query.category as string)
    : "";
  const flag = (FLAG_TYPES as string[]).includes(query.flag ?? "") ? (query.flag as string) : "";
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit))
    ? Number(query.limit)
    : DEFAULT_PAGE_LIMIT;

  return {
    office,
    status,
    category,
    barangayId: query.barangayId ?? "",
    flag,
    search: query.search ?? "",
    from: query.from ?? "",
    to: query.to ?? "",
    page: Math.max(1, Number(query.page) || 1),
    limit,
  };
}

function buildParams(state: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("office", state.office);
  params.set("status", state.status);
  params.set("limit", String(state.limit));
  params.set("page", String(state.page));
  if (state.category) params.set("category", state.category);
  if (state.barangayId) params.set("barangayId", state.barangayId);
  if (state.flag) params.set("flag", state.flag);
  if (state.search) params.set("search", state.search);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  return params;
}

// Which built-in tab the current filters match, or null when they are ad-hoc.
// Deliberately not "fall back to All flagged", which would claim a preset the
// admin is not actually looking at.
function matchBuiltInView(state: QueryState, defaultOffice: string): BuiltInFlaggedViewKey | null {
  const bare =
    state.category === "" &&
    state.barangayId === "" &&
    state.flag === "" &&
    state.search === "" &&
    state.from === "" &&
    state.to === "" &&
    state.office === defaultOffice;
  if (!bare) return null;
  if (state.status === "all") return "all";
  if (state.status === "pending") return "pending";
  if (state.status === "quarantined") return "quarantined";
  if (state.status === "dismissed") return "dismissed";
  if (state.status === "duplicate") return "duplicate";
  return null;
}

export function FlaggedWorkspace({
  initialData,
  initialQuery,
  initialStats,
  initialSavedViews = [],
  barangays,
  sessionOffice,
  isSystemAdmin = false,
}: {
  initialData: PaginatedModeration;
  initialQuery: Record<string, string | undefined>;
  initialStats: ModerationStats;
  initialSavedViews?: SavedView[];
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
  const [stats, setStats] = useState(initialStats);
  const [savedViews, setSavedViews] = useState(initialSavedViews);
  const [activeSavedViewId, setActiveSavedViewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);

  const [columnVisibility, setColumnVisibility] = useState<FlaggedColumnVisibility>({});
  const [density, setDensity] = useState<FlaggedDensity>("comfortable");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkModerationResult | null>(null);

  const skipFetchRef = useRef(true);
  const skipSearchDebounceRef = useRef(true);

  const visibleIds = data.reports.map((r) => r.id);
  const selection = useFlaggedSelection(visibleIds);
  const { clear: clearSelection } = selection;

  const openReview = useCallback((id: number) => setSelectedId(id), []);
  const { focusedId, setFocusedId } = useFlaggedKeyboard({
    ids: visibleIds,
    onToggleSelect: selection.toggle,
    onOpen: openReview,
    // The drawer owns the keyboard while it is open — J/K there would move the
    // list underneath the report being reviewed.
    enabled: selectedId === null && !saveViewOpen,
  });

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
    Promise.all([
      fetch(`/api/admin/moderation?${params.toString()}`).then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      }),
      fetch("/api/admin/moderation/stats").then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      }),
    ])
      .then(([queueJson, statsJson]) => {
        if (cancelled) return;
        setData(queueJson);
        setStats(statsJson);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load flagged reports.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, pathname, router, refetchNonce]);

  function updateFilter(patch: Partial<QueryState>) {
    setActiveSavedViewId(null);
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  function resetFilters() {
    setSearchInput("");
    setActiveSavedViewId(null);
    setQuery((q) => ({
      ...q,
      office: defaultOffice,
      status: "pending",
      category: "",
      barangayId: "",
      flag: "",
      search: "",
      from: "",
      to: "",
      page: 1,
    }));
  }

  const activeViewKey =
    activeSavedViewId === null ? matchBuiltInView(query, defaultOffice) : null;

  function selectBuiltInView(key: BuiltInFlaggedViewKey) {
    setSearchInput("");
    setActiveSavedViewId(null);
    setQuery((q) => ({
      ...q,
      office: defaultOffice,
      status: key === "all" ? "all" : key,
      category: "",
      barangayId: "",
      flag: "",
      search: "",
      from: "",
      to: "",
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
    setQuery(parsed);
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
        body: JSON.stringify({
          name,
          query: buildParams(query).toString(),
          surface: SAVED_VIEW_SURFACE,
        }),
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

  // No bulk endpoint exists for moderation, and this loops the single-report
  // route rather than adding one. That is the honest shape here: every report
  // gets its own audit event and its own citizen notification, exactly as if a
  // moderator had opened each one — and a mixed selection (some already
  // decided) half-succeeds, which the caller is told about per id.
  async function bulkModerate({
    action,
    note,
    canonicalReportId,
  }: {
    action: ModerationAction;
    note?: string;
    canonicalReportId?: number;
  }) {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;

    setBulkBusy(true);
    setBulkResult(null);
    const ok: number[] = [];
    const failed: { id: number; reason: string }[] = [];

    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/reports/${id}/moderate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note, canonicalReportId }),
        });
        if (res.ok) {
          ok.push(id);
        } else {
          const body = await res.json().catch(() => ({}));
          failed.push({ id, reason: body.error ?? body.message ?? `Failed (${res.status})` });
        }
      } catch {
        failed.push({ id, reason: "Network error" });
      }
    }

    setBulkBusy(false);
    setBulkResult({ action: ACTION_LABEL[action], ok, failed });
    // Only the reports that actually moved leave the selection: the ones that
    // failed stay selected so the admin can retry them without re-finding them.
    if (failed.length === 0) clearSelection();
    setRefetchNonce((n) => n + 1);
  }

  function toggleColumn(key: FlaggedColumnKey) {
    setColumnVisibility((visibility) => ({ ...visibility, [key]: visibility[key] === false }));
  }

  const filters: FlaggedFilterValues = {
    office: query.office,
    status: query.status,
    category: query.category,
    barangayId: query.barangayId,
    flag: query.flag,
    from: query.from,
    to: query.to,
  };

  const filterChips: FilterChip[] = [];
  if (query.flag) {
    filterChips.push({ key: "flag", label: `Flag: ${FLAG_TYPE_LABELS[query.flag] ?? query.flag}` });
  }
  if (query.status !== "pending") {
    filterChips.push({
      key: "status",
      label: `Status: ${query.status === "all" ? "All" : moderationStatusLabel(query.status)}`,
    });
  }
  if (query.office !== defaultOffice) {
    filterChips.push({ key: "office", label: `Office: ${query.office === "all" ? "All" : query.office}` });
  }
  if (query.category) filterChips.push({ key: "category", label: `Category: ${query.category}` });
  if (query.barangayId) {
    const name = barangays.find((b) => String(b.id) === query.barangayId)?.name ?? query.barangayId;
    filterChips.push({ key: "barangayId", label: `Barangay: ${name}` });
  }
  if (query.from) filterChips.push({ key: "from", label: `From: ${query.from}` });
  if (query.to) filterChips.push({ key: "to", label: `To: ${query.to}` });

  function removeChip(key: string) {
    if (key === "status") updateFilter({ status: "pending" });
    else if (key === "office") updateFilter({ office: defaultOffice });
    else updateFilter({ [key]: "" } as Partial<QueryState>);
  }

  const exportParams = buildParams(query);
  const selectionExportParams = new URLSearchParams(exportParams);
  selectionExportParams.set("ids", selection.selectedIds.join(","));

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);
  const builtInViews = buildBuiltInFlaggedViews(stats);

  // Drawer navigation walks the page currently on screen, in the order it is
  // displayed — the same order the moderator is reading.
  const selectedIndex = selectedId === null ? -1 : visibleIds.indexOf(selectedId);
  const selectedReport: ModerationQueueRow | null =
    selectedIndex >= 0 ? data.reports[selectedIndex] : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">Flagged Reports</h1>
          <p className="mt-1.5 max-w-[68ch] text-[13px] text-muted-foreground">
            Flags are a signal, not an auto-reject — every report below was still created. Review the
            evidence and choose an action.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/admin/reports/flagged.csv?${exportParams.toString()}`}>
            <DownloadIcon />
            Export CSV
          </a>
        </Button>
      </div>

      <FlaggedViewTabs
        activeKey={activeViewKey}
        activeSavedViewId={activeSavedViewId}
        onDeleteSaved={deleteSavedView}
        onSaveCurrent={() => setSaveViewOpen(true)}
        onSelectBuiltIn={selectBuiltInView}
        onSelectSaved={selectSavedView}
        savedViews={savedViews}
        views={builtInViews}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={ShieldAlertIcon}
          label="Pending review"
          note="awaiting a decision"
          value={stats.pending.toLocaleString()}
        />
        <KpiCard
          icon={BanIcon}
          label="Quarantined"
          note="hidden from map"
          value={stats.quarantined.toLocaleString()}
        />
        <KpiCard
          icon={CircleCheckIcon}
          label="Dismissed"
          note="kept as-is"
          value={stats.dismissed.toLocaleString()}
        />
        <KpiCard
          icon={ClockIcon}
          label="Avg. resolution time"
          note="flag to decision"
          value={stats.avgResolutionHours == null ? "—" : `${stats.avgResolutionHours.toFixed(1)}h`}
        />
      </div>

      {error && !loading && (
        <AdminErrorCard
          message="Something went wrong while updating the flagged queue."
          onRetry={retry}
          title="Moderation action failed"
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <FlaggedToolbar
          activeFilterCount={filterChips.length}
          barangays={barangays}
          columnVisibility={columnVisibility}
          density={density}
          filterChips={filterChips}
          filters={filters}
          isSystemAdmin={isSystemAdmin}
          onClearAll={resetFilters}
          onDensityChange={setDensity}
          onFilterChange={(patch) => updateFilter(patch)}
          onRemoveChip={removeChip}
          onSearchInput={setSearchInput}
          onToggleColumn={toggleColumn}
          searchInput={searchInput}
          sessionOffice={sessionOffice}
        />

        {selection.selectedIds.length > 0 && (
          <FlaggedBulkBar
            busy={bulkBusy}
            exportHref={`/api/admin/reports/flagged.csv?${selectionExportParams.toString()}`}
            onClearSelection={clearSelection}
            onDismissResult={() => setBulkResult(null)}
            onModerate={bulkModerate}
            result={bulkResult}
            selectedIds={selection.selectedIds}
          />
        )}

        <FlaggedTable
          columnVisibility={columnVisibility}
          density={density}
          error={error}
          focusedId={focusedId}
          headerState={selection.headerState}
          isSelected={selection.isSelected}
          loading={loading}
          onFocusRow={setFocusedId}
          onRetry={retry}
          onReview={openReview}
          onToggleAll={selection.toggleAll}
          onToggleSelect={selection.toggle}
          reports={data.reports}
          skeletonRows={data.limit}
        />

        <FlaggedPagination
          from={from}
          limit={query.limit}
          onLimitChange={(limit) => setQuery((q) => ({ ...q, limit, page: 1 }))}
          onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
          page={data.page}
          to={to}
          total={data.total}
          totalPages={data.totalPages}
        />
      </div>

      <FlaggedReviewDrawer
        hasNext={selectedIndex >= 0 && selectedIndex < visibleIds.length - 1}
        hasPrevious={selectedIndex > 0}
        onClose={() => setSelectedId(null)}
        onModerated={() => {
          setSelectedId(null);
          setRefetchNonce((n) => n + 1);
        }}
        onNext={() => setSelectedId(visibleIds[selectedIndex + 1] ?? selectedId)}
        onPrevious={() => setSelectedId(visibleIds[selectedIndex - 1] ?? selectedId)}
        report={selectedReport}
      />

      <Dialog onOpenChange={setSaveViewOpen} open={saveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Saves the current filters and page size as a personal tab on this page only. Only you
              can see it. Saving over an existing name replaces it.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="View name"
            maxLength={40}
            onChange={(e) => setSaveViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrentView();
            }}
            placeholder="e.g. Duplicate photos, MDRRMO"
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

const ACTION_LABEL: Record<ModerationAction, string> = {
  dismiss: "Dismiss flags",
  quarantine: "Quarantine",
  duplicate: "Mark duplicate",
};

// Same card as the Ticket Queue's KPI row — flat, bordered, one accent icon.
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
          className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
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
