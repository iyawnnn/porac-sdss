"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon, SearchXIcon } from "lucide-react";
import type { BarangayInsightRow, BarangayInsightsResponse } from "@/lib/types/admin-barangay-insights";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminErrorCard } from "../shared/AdminErrorCard";
import { EmptyState } from "../shared/EmptyState";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const HEAD_CLASS = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

// Numeric metric columns only — Resolved and Top Category stay unsortable
// per the issue scope, and Barangay itself is the implicit default order
// (the backend already returns rows ORDER BY b.name ASC).
type SortableKey = "total_tickets" | "active_tickets" | "high_urgency_tickets" | "last_activity_at";
type SortState = { key: SortableKey; direction: "asc" | "desc" };

// No recorded activity sorts as older than any real date, in both
// directions — a barangay with zero tickets never jumps to the top of a
// "most recent" sort just because -Infinity flips sign under descending.
function lastActivityValue(value: string | null): number {
  return value === null ? -Infinity : new Date(value).getTime();
}

function sortValue(row: BarangayInsightRow, key: SortableKey): number {
  return key === "last_activity_at" ? lastActivityValue(row.last_activity_at) : row[key];
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground/50" />;
  return direction === "asc"
    ? <ArrowUpIcon aria-hidden="true" className="size-3.5" />
    : <ArrowDownIcon aria-hidden="true" className="size-3.5" />;
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortableKey;
  sort: SortState | null;
  onSort: (key: SortableKey) => void;
  className?: string;
}) {
  const active = sort !== null && sort.key === sortKey;
  return (
    <TableHead aria-sort={sort && sort.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`${HEAD_CLASS} ${className ?? ""}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(sortKey)} type="button">
        {label}
        <SortIcon active={active} direction={sort?.direction ?? "desc"} />
      </button>
    </TableHead>
  );
}

export function BarangayInsightsWorkspace({
  initialData,
  sessionOffice,
  isSystemAdmin = false,
}: {
  initialData: BarangayInsightsResponse;
  sessionOffice?: string;
  isSystemAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [office, setOffice] = useState(initialData.office === "ALL" ? "all" : initialData.office);
  const [search, setSearch] = useState("");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);
  const skipFetchRef = useRef(true);

  useEffect(() => {
    if (!isSystemAdmin) return;
    const params = new URLSearchParams();
    if (office !== "all") params.set("office", office);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });

    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/barangay-insights${office !== "all" ? `?office=${office}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((json: BarangayInsightsResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load barangay insights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [office, isSystemAdmin, pathname, router, refetchNonce]);

  function retry() {
    setRefetchNonce((n) => n + 1);
  }

  // Same column again toggles desc <-> asc; a different column always
  // restarts at desc, since that surfaces the highest values first.
  function handleSort(key: SortableKey) {
    setSort((prev) => (prev && prev.key === key ? { key, direction: prev.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" }));
  }

  // filter() already returns a fresh array, and sort() below runs against
  // that copy — data.barangays (and its ORDER BY b.name ASC from the
  // backend) is never mutated, which is also what keeps the unsorted
  // default page order alphabetical.
  const filtered = useMemo(() => {
    const rows = data.barangays.filter((b) => b.barangay_name.toLowerCase().includes(search.trim().toLowerCase()));
    if (!sort) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;
    return rows.sort((a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * dir);
  }, [data.barangays, search, sort]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="font-heading text-base font-semibold">Barangay Insights</h1>
          <p className="text-xs text-muted-foreground">Office-scoped ticket activity across every barangay.</p>
        </div>
      </div>

      <Card className="gap-0">
        <CardContent className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-[320px]">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search barangays"
              className="pl-8"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by barangay name..."
              type="search"
              value={search}
            />
          </div>
          {isSystemAdmin ? (
            <Select onValueChange={setOffice} value={office}>
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
        </CardContent>

        <CardContent className="p-0">
          {error ? (
            <div className="p-4">
              <AdminErrorCard message={error} onRetry={retry} title="Couldn't load barangay insights" />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className={`${HEAD_CLASS} pl-6`}>Barangay</TableHead>
                  <SortableHead className="text-center" label="Total" onSort={handleSort} sort={sort} sortKey="total_tickets" />
                  <SortableHead className="text-center" label="Active" onSort={handleSort} sort={sort} sortKey="active_tickets" />
                  <TableHead className={`${HEAD_CLASS} text-center`}>Resolved</TableHead>
                  <SortableHead className="text-center" label="High Urgency" onSort={handleSort} sort={sort} sortKey="high_urgency_tickets" />
                  <TableHead className={HEAD_CLASS}>Top Category</TableHead>
                  <SortableHead className="pr-6" label="Last Activity" onSort={handleSort} sort={sort} sortKey="last_activity_at" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="p-0" colSpan={7}>
                      <EmptyState icon={SearchXIcon} title="No barangays match this search." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b) => (
                    <TableRow key={b.barangay_id}>
                      <TableCell className="pl-6">
                        <Link className="font-medium hover:underline" href={`/admin/barangay-insights/${b.barangay_id}`}>
                          {b.barangay_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{b.total_tickets}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{b.active_tickets}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{b.resolved_tickets}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{b.high_urgency_tickets}</TableCell>
                      <TableCell>{b.top_category ?? "—"}</TableCell>
                      <TableCell className="pr-6 text-xs text-muted-foreground">{formatDate(b.last_activity_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow className="hover:bg-transparent" key={i}>
          {Array.from({ length: 7 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
