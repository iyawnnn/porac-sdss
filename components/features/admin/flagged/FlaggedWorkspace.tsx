"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ban, CheckCircle2, Copy, ImageOffIcon, SearchIcon, ShieldAlert, type LucideIcon } from "lucide-react";
import type { ModerationQueueRow, ModerationStats, ModerationAction, PaginatedModeration } from "@/lib/types/admin-moderation";
import { MODERATION_STATUSES, FLAG_TYPES } from "@/lib/types/admin-moderation";
import { TICKET_CATEGORIES, PAGE_LIMITS, DEFAULT_PAGE_LIMIT } from "@/lib/types/admin-ticket-constants";
import { computeRiskScore } from "@/lib/utils/flag-risk";
import { flagEvidence, flagLabel, moderationStatusLabel, FLAG_TYPE_LABELS } from "./flagText";
import { KpiBar } from "./KpiBar";
import { FlagBadge } from "./FlagBadge";
import { RiskMeter } from "./RiskMeter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { AdminErrorCard } from "../shared/AdminErrorCard";

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

function initialQueryState(query: Record<string, string | undefined>, sessionOffice?: string): QueryState {
  const office =
    query.office === "all" || query.office === "MEO" || query.office === "MDRRMO"
      ? query.office
      : (sessionOffice ?? "all");
  const status =
    query.status === "all" || (MODERATION_STATUSES as string[]).includes(query.status ?? "") ? (query.status as string) : "pending";
  const category = (TICKET_CATEGORIES as readonly string[]).includes(query.category ?? "") ? (query.category as string) : "";
  const flag = (FLAG_TYPES as string[]).includes(query.flag ?? "") ? (query.flag as string) : "";
  const limit = (PAGE_LIMITS as readonly number[]).includes(Number(query.limit)) ? Number(query.limit) : DEFAULT_PAGE_LIMIT;

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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const HEAD_CLASS = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

// Deliberately distinct from FLAG_CATEGORIES' palette (lib/utils/flag-risk.ts) — moderation
// status and flag type are different axes shown in the same row, and must not share hues
// (e.g. "Quarantined" status vs. "Photo authenticity" flag both being rose read as one signal).
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-800",
  quarantined: "border-orange-200 bg-orange-50 text-orange-700",
  dismissed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  duplicate: "border-sky-200 bg-sky-50 text-sky-700",
};

function ModerationStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "pending";
  return (
    <Badge className={STATUS_BADGE_CLASS[key]} variant="outline">
      {moderationStatusLabel(status)}
    </Badge>
  );
}

function RowThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div aria-label={`${alt} — image unavailable`} className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground" role="img">
        <ImageOffIcon aria-hidden="true" className="size-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} className="size-10 shrink-0 rounded-md border object-cover" onError={() => setFailed(true)} src={src} />
  );
}

export function FlaggedWorkspace({
  initialData,
  initialQuery,
  initialStats,
  barangays,
  sessionOffice,
}: {
  initialData: PaginatedModeration;
  initialQuery: Record<string, string | undefined>;
  initialStats: ModerationStats;
  barangays: Barangay[];
  sessionOffice?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<QueryState>(() => initialQueryState(initialQuery, sessionOffice));
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState(initialData);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const skipFetchRef = useRef(true);
  const skipSearchDebounceRef = useRef(true);

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load flagged reports.");
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
    setQuery({ office: sessionOffice ?? "all", status: "pending", category: "", barangayId: "", flag: "", search: "", from: "", to: "", page: 1, limit: query.limit });
  }

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  function refetchNow() {
    setRefetchNonce((n) => n + 1);
  }

  const hasActiveFilters =
    query.office !== (sessionOffice ?? "all") ||
    query.status !== "pending" ||
    query.category !== "" ||
    query.barangayId !== "" ||
    query.flag !== "" ||
    query.search !== "" ||
    query.from !== "" ||
    query.to !== "";

  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const to = Math.min(data.total, data.page * data.limit);
  const sortedBarangays = [...barangays].sort((a, b) => a.name.localeCompare(b.name));
  const selected = data.reports.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="space-y-0.5">
        <h1 className="font-heading text-base font-semibold">Flagged Reports</h1>
        <p className="text-xs text-muted-foreground">
          Flags are a signal, not an auto-reject — every report below was still created. Review the evidence and choose an action.
        </p>
      </div>

      <KpiBar stats={stats} />

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-[320px]">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search flagged reports"
              className="pl-8"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title or citizen name..."
              type="search"
              value={searchInput}
            />
          </div>
          <Select onValueChange={(v) => updateFilter({ status: v })} value={query.status}>
            <SelectTrigger aria-label="Moderation status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending review</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              {MODERATION_STATUSES.filter((s) => s !== "pending").map((s) => (
                <SelectItem key={s} value={s}>
                  {moderationStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ flag: v === "all" ? "" : v })} value={query.flag || "all"}>
            <SelectTrigger aria-label="Flag type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flag types</SelectItem>
              {FLAG_TYPES.map((f) => (
                <SelectItem key={f} value={f}>
                  {FLAG_TYPE_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => updateFilter({ office: v })} value={query.office}>
            <SelectTrigger aria-label="Office"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offices</SelectItem>
              <SelectItem value="MEO">MEO</SelectItem>
              <SelectItem value="MDRRMO">MDRRMO</SelectItem>
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
          <div className="flex items-center gap-1.5">
            <Input aria-label="Submitted from" className="w-[140px]" onChange={(e) => updateFilter({ from: e.target.value })} type="date" value={query.from} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input aria-label="Submitted to" className="w-[140px]" onChange={(e) => updateFilter({ to: e.target.value })} type="date" value={query.to} />
          </div>
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
                <TableHead className={`${HEAD_CLASS} pl-6`}>Report</TableHead>
                <TableHead className={HEAD_CLASS}>Flags</TableHead>
                <TableHead className={HEAD_CLASS}>Category</TableHead>
                <TableHead className={HEAD_CLASS}>Barangay</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Office</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Submitted</TableHead>
                <TableHead className={`${HEAD_CLASS} text-center`}>Moderation</TableHead>
                <TableHead className={`${HEAD_CLASS} pr-6 text-end`}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-4" colSpan={8}>
                    <AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh flagged reports" />
                  </TableCell>
                </TableRow>
              ) : loading ? (
                <SkeletonRows count={data.limit} />
              ) : data.reports.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell className="p-10 text-center" colSpan={8}>
                    <EmptyState />
                  </TableCell>
                </TableRow>
              ) : (
                data.reports.map((report) => <ReportRow key={report.id} onReview={() => setSelectedId(report.id)} report={report} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile card list */}
      <div className="flex flex-col gap-2 md:hidden">
        {error ? (
          <AdminErrorCard message={error} onRetry={retry} title="Couldn't refresh flagged reports" />
        ) : loading ? (
          Array.from({ length: Math.min(data.limit, 8) }).map((_, i) => <ReportCardSkeleton key={i} />)
        ) : data.reports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-1 p-8 text-center">
              <EmptyState />
            </CardContent>
          </Card>
        ) : (
          data.reports.map((report) => <ReportCard key={report.id} onReview={() => setSelectedId(report.id)} report={report} />)
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{data.total === 0 ? "No flagged reports" : `Showing ${from}–${to} of ${data.total} flagged reports`}</p>
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

      <Sheet onOpenChange={(open) => !open && setSelectedId(null)} open={selected !== null}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md" side="right">
          {selected && (
            <ReportDetail
              onModerated={() => {
                setSelectedId(null);
                refetchNow();
              }}
              report={selected}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyState() {
  return (
    <>
      <ShieldAlert aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No flagged reports match this filter.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try widening your search or resetting filters.</p>
    </>
  );
}

function FlagsCell({ flags }: { flags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <FlagBadge flag={flags[0]} />
      {flags.length > 1 && <span className="text-xs text-muted-foreground">+{flags.length - 1} more</span>}
    </div>
  );
}

function ReportRow({ report, onReview }: { report: ModerationQueueRow; onReview: () => void }) {
  return (
    <TableRow>
      <TableCell className="max-w-64 pl-6">
        <div className="flex items-center gap-2.5">
          <RowThumbnail alt={`Evidence photo for "${report.title}"`} src={report.image_url} />
          <div className="min-w-0">
            <button className="block truncate text-left font-medium hover:underline" onClick={onReview} title={report.title} type="button">
              {report.title}
            </button>
            <div className="text-xs text-muted-foreground">
              Report <span className="font-mono">#{report.id}</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <FlagsCell flags={report.flags} />
      </TableCell>
      <TableCell>{report.category}</TableCell>
      <TableCell className="max-w-32">
        <span className="block truncate" title={report.barangay_name}>
          {report.barangay_name}
        </span>
      </TableCell>
      <TableCell className="text-center">{report.assigned_office}</TableCell>
      <TableCell className="text-center text-xs">{formatDate(report.created_at)}</TableCell>
      <TableCell className="text-center">
        <ModerationStatusBadge status={report.moderation_status} />
      </TableCell>
      <TableCell className="pr-6 text-end">
        <Button onClick={onReview} size="sm" variant="outline">
          Review
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ReportCard({ report, onReview }: { report: ModerationQueueRow; onReview: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <RowThumbnail alt={`Evidence photo for "${report.title}"`} src={report.image_url} />
            <div className="min-w-0">
              <p className="truncate font-medium" title={report.title}>
                {report.title}
              </p>
              <p className="font-mono text-xs text-muted-foreground">#{report.id} · {report.category}</p>
            </div>
          </div>
          <ModerationStatusBadge status={report.moderation_status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {report.barangay_name} · {report.assigned_office} · {formatDate(report.created_at)}
        </p>
        <FlagsCell flags={report.flags} />
        <Button className="self-start" onClick={onReview} size="sm" variant="outline">
          Review
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
          {Array.from({ length: 8 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function ReportCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-7 w-24" />
      </CardContent>
    </Card>
  );
}

type PendingAction = { action: ModerationAction } | null;

function ReportDetail({ report, onModerated }: { report: ModerationQueueRow; onModerated: () => void }) {
  const score = computeRiskScore(report.flags);
  const trustRatio = report.citizen_report_count > 0 ? Math.round((1 - report.citizen_flag_count / report.citizen_report_count) * 100) : 100;
  const isPending = report.moderation_status === null;

  const [pending, setPending] = useState<PendingAction>(null);
  const [note, setNote] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function startAction(action: ModerationAction) {
    setPending({ action });
    setNote("");
    setDuplicateId("");
    setActionError(null);
  }

  async function confirmAction() {
    if (!pending) return;
    if (pending.action === "quarantine" && !note.trim()) {
      setActionError("A moderation note is required to quarantine a report.");
      return;
    }
    if (pending.action === "duplicate" && !duplicateId.trim()) {
      setActionError("Enter the canonical report ID first.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    const res = await fetch(`/api/admin/reports/${report.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: pending.action,
        canonicalReportId: pending.action === "duplicate" ? Number(duplicateId) : undefined,
        note: note.trim() || undefined,
      }),
    });
    const responseData = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setActionError(responseData.error ?? "Action failed.");
      return;
    }
    onModerated();
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{report.title}</SheetTitle>
        <SheetDescription>
          {report.category} · {report.barangay_name} ·{" "}
          <Link className="text-primary underline" href={`/admin/tickets/${report.ticket_id}`}>
            Ticket #{report.ticket_id}
          </Link>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <ModerationStatusBadge status={report.moderation_status} />
          <RiskMeter score={score} size="lg" />
        </div>

        <ImageLightbox alt={`Evidence photo submitted for "${report.title}" in ${report.barangay_name}, flagged for review`} src={report.image_url} />

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Report / Ticket</dt>
            <dd className="font-mono">
              #{report.id} / #{report.ticket_id}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Citizen severity</dt>
            <dd>{report.citizen_severity}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Office</dt>
            <dd>{report.assigned_office}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Submitted</dt>
            <dd>{new Date(report.created_at).toLocaleString()}</dd>
          </div>
        </dl>

        {report.description && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
            <p className="text-sm">{report.description}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flag breakdown</p>
          <ul className="space-y-1.5">
            {report.flags.map((flag) => (
              <li className="flex flex-wrap items-center gap-2 text-sm" key={flag}>
                <FlagBadge flag={flag} />
                <span className="text-muted-foreground">{flagEvidence(flag, report) || flagLabel(flag)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reporter history</p>
          <p className="mt-1 text-sm">
            {report.citizen_name} · {report.citizen_report_count} report{report.citizen_report_count === 1 ? "" : "s"} submitted, {report.citizen_flag_count} flagged
          </p>
          <p className="text-xs text-muted-foreground">{trustRatio}% clean submission rate</p>
        </div>

        {!isPending && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Moderation decision</p>
            <p className="mt-1">
              {moderationStatusLabel(report.moderation_status)} by {report.moderated_by ?? "—"}
              {report.moderated_at && ` on ${new Date(report.moderated_at).toLocaleString()}`}
            </p>
            {report.moderation_status === "duplicate" ? (
              <p className="text-muted-foreground">Canonical report #{report.moderation_note}</p>
            ) : (
              report.moderation_note && <p className="text-muted-foreground">&ldquo;{report.moderation_note}&rdquo;</p>
            )}
          </div>
        )}

        {isPending &&
          (pending ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              {pending.action === "duplicate" ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium" htmlFor="canonical-report-id">
                    Canonical report ID this duplicates
                  </label>
                  <Input id="canonical-report-id" onChange={(e) => setDuplicateId(e.target.value)} placeholder="e.g. 42" type="number" value={duplicateId} />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm">
                    {pending.action === "dismiss" ? "Dismiss this flag? The report stays visible as-is." : "Quarantine this report? It will be hidden from the public map immediately."}
                  </p>
                  <label className="block text-xs font-medium" htmlFor="moderation-note">
                    Moderation note {pending.action === "quarantine" ? "(required)" : "(optional)"}
                  </label>
                  <Textarea id="moderation-note" onChange={(e) => setNote(e.target.value)} placeholder="Why this decision?" value={note} />
                </div>
              )}
              {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}
              <div className="mt-3 flex gap-2">
                <Button disabled={submitting} onClick={confirmAction} size="sm">
                  {submitting ? "Working..." : "Confirm"}
                </Button>
                <Button disabled={submitting} onClick={() => setPending(null)} size="sm" variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={CheckCircle2} label="Dismiss flag" onClick={() => startAction("dismiss")} tone="emerald" />
              <ActionButton icon={Ban} label="Quarantine report" onClick={() => startAction("quarantine")} tone="rose" />
              <ActionButton icon={Copy} label="Mark as duplicate" onClick={() => startAction("duplicate")} tone="neutral" />
            </div>
          ))}
      </div>
    </>
  );
}

const TONE_CLASS: Record<string, string> = {
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
  rose: "bg-rose-600 text-white hover:bg-rose-700",
  neutral: "",
};

function ActionButton({ icon: Icon, label, onClick, tone }: { icon: LucideIcon; label: string; onClick: () => void; tone: string }) {
  return (
    <Button className={TONE_CLASS[tone]} onClick={onClick} size="sm" variant={tone === "neutral" ? "outline" : "default"}>
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
