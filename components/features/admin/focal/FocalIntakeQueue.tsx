"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon, SearchXIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { TABLE_HEAD_CLASS } from "@/components/features/admin/shared/tableHead";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import type { FocalIntakeRow, IntakeState } from "@/lib/types/admin-focal-intake";

const INTAKE_STATES: IntakeState[] = ["New", "Acknowledged", "Screened", "Forwarded", "Escalated"];
type StateFilter = "All" | IntakeState;
type OfficeFilter = "All" | "MEO" | "MDRRMO";
type UrgencyFilter = "All" | "LOW" | "MEDIUM" | "HIGH";

function matchesSearch(report: FocalIntakeRow, query: string): boolean {
  if (!query) return true;
  return (
    report.reportReference.toLowerCase().includes(query) ||
    report.category.toLowerCase().includes(query) ||
    report.barangayName.toLowerCase().includes(query)
  );
}

function formatSubmittedAgo(at: string): string {
  const hours = (Date.now() - new Date(at).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "under an hour ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Municipality-wide incoming-report monitoring/screening table — a
// separate surface from the operational Ticket Queue, not an all-office
// adaptation of it. Filtering is client-side over the already-fetched
// intake rows (the API itself has no office/status query params to widen —
// see FocalIntakeService.listIntake).
export function FocalIntakeQueue({ initialRows }: { initialRows: FocalIntakeRow[] }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("All");
  const [officeFilter, setOfficeFilter] = useState<OfficeFilter>("All");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("All");

  const reports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...initialRows]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .filter((report) => {
        if (stateFilter !== "All" && report.intakeState !== stateFilter) return false;
        if (officeFilter !== "All" && report.routedOffice !== officeFilter) return false;
        if (urgencyFilter !== "All" && report.hazardUrgency.level !== urgencyFilter) return false;
        return matchesSearch(report, query);
      });
  }, [initialRows, search, stateFilter, officeFilter, urgencyFilter]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Intake Queue</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Municipality-wide incoming reports awaiting acknowledgment, screening, or forwarding.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <div className="relative w-full max-w-[340px] min-w-[200px] flex-1">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search intake queue"
              className="h-8 bg-card pl-8 text-[13px]"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Report reference, category or barangay"
              type="search"
              value={search}
            />
          </div>

          <Select onValueChange={(v) => setStateFilter(v as StateFilter)} value={stateFilter}>
            <SelectTrigger aria-label="Filter by intake state" className="h-8 w-[168px] bg-card text-[13px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All intake states</SelectItem>
              {INTAKE_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => setOfficeFilter(v as OfficeFilter)} value={officeFilter}>
            <SelectTrigger aria-label="Filter by routed office" className="h-8 w-36 bg-card text-[13px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Offices</SelectItem>
              <SelectItem value="MEO">MEO</SelectItem>
              <SelectItem value="MDRRMO">MDRRMO</SelectItem>
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => setUrgencyFilter(v as UrgencyFilter)} value={urgencyFilter}>
            <SelectTrigger aria-label="Filter by Hazard Urgency" className="h-8 w-36 bg-card text-[13px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Hazard Urgency</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table className="text-[13px]" style={{ minWidth: 920 }}>
          <TableCaption className="sr-only">Incoming reports, filtered by intake state, routed office and Hazard Urgency.</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TABLE_HEAD_CLASS + " pl-4"} scope="col">Report</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Location</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Category</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Routed To</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Hazard Urgency</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Intake State</TableHead>
              <TableHead className={TABLE_HEAD_CLASS} scope="col">Submitted</TableHead>
              <TableHead className={TABLE_HEAD_CLASS + " pr-4 text-end"} scope="col">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="p-0" colSpan={8}>
                  <EmptyState description="Try widening your search or clearing filters." icon={SearchXIcon} title="No reports match this filter." />
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => {
                const urgencyBadge = getUrgencyBadgeConfig(report.hazardUrgency.index);
                return (
                  <TableRow className="hover:bg-[var(--brand-subtle)]" key={report.reportId}>
                    <TableCell className="max-w-48 py-2.5 pl-4">
                      <span className="block truncate font-medium">{report.reportReference}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{report.ticketReference}</span>
                    </TableCell>
                    <TableCell className="max-w-52 py-2.5">
                      <span className="block truncate">{report.barangayName}</span>
                    </TableCell>
                    <TableCell className="max-w-56 py-2.5 text-muted-foreground" title={report.category}>
                      <span className="line-clamp-2">{report.category}</span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="secondary">{report.routedOffice}</Badge>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap ${urgencyBadge.className}`}>
                        {urgencyBadge.label.toUpperCase()} <span className="mx-1 opacity-60">&middot;</span> <span className="font-mono tabular-nums">{report.hazardUrgency.index ?? "—"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline">{report.intakeState}</Badge>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground">{formatSubmittedAgo(report.submittedAt)}</TableCell>
                    <TableCell className="py-2.5 pr-4 text-end">
                      <Link
                        className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
                        href={`/admin/focal/intake/${report.reportId}`}
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
