"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon, SearchXIcon } from "lucide-react";
import type { BarangayInsightsResponse } from "@/lib/types/admin-barangay-insights";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminErrorCard } from "../shared/AdminErrorCard";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const HEAD_CLASS = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

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

  const filtered = data.barangays.filter((b) => b.barangay_name.toLowerCase().includes(search.trim().toLowerCase()));

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
                  <TableHead className={`${HEAD_CLASS} text-center`}>Total</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-center`}>Active</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-center`}>Resolved</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-center`}>High Urgency</TableHead>
                  <TableHead className={HEAD_CLASS}>Top Category</TableHead>
                  <TableHead className={`${HEAD_CLASS} pr-6`}>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows />
                ) : filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="p-10 text-center" colSpan={7}>
                      <SearchXIcon aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">No barangays match this search.</p>
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
