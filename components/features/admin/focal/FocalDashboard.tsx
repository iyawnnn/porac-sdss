"use client";

import Link from "next/link";
import { AlertTriangleIcon, ClipboardListIcon, InboxIcon, SendIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardBodyPanel } from "@/components/features/admin/shared/CardBodyPanel";
import { CardHeaderRow } from "@/components/features/admin/shared/CardHeaderRow";
import { TABLE_HEAD_CLASS } from "@/components/features/admin/shared/tableHead";
import { KpiCard } from "@/components/features/admin/shared/KpiCard";
import { EmptyState } from "@/components/features/admin/shared/EmptyState";
import { priorityBandClass, priorityBandLabel } from "@/lib/utils/ui/priority";
import type { FocalDashboardCounts, FocalDashboardReports } from "@/lib/types/admin-focal-dashboard";
import { metricDuration } from "@/lib/utils/metric-duration";
import { Button } from "@/components/ui/button";

function formatSubmittedAgo(at: string): string {
  const hours = (Date.now() - new Date(at).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "under an hour ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Municipality-wide intake monitoring, distinct from the operational MEO/
// MDRRMO dashboard — answers "what came in, has it been acknowledged/
// screened, and where was it routed," not work-order/resolved stats. No
// SLA/overdue-timer language: the manuscript does not establish an
// acknowledgment SLA.
export function FocalDashboard({ counts, reportsPage }: { counts: FocalDashboardCounts; reportsPage: FocalDashboardReports }) {
  const { newReports, unacknowledged, needsScreening, forwardedOrEscalated } = counts;
  const reports = reportsPage.items;
  const pageHref = (page: number) => `/admin/focal?page=${page}&pageSize=${reportsPage.pageSize}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Focal Dashboard</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Municipality-wide view of incoming reports, acknowledgment, and initial routing.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="focal-kpi-row">
        <KpiCard icon={InboxIcon} label="New Reports" value={newReports.toLocaleString()} />
        <KpiCard icon={AlertTriangleIcon} label="Unacknowledged" value={unacknowledged.toLocaleString()} />
        <KpiCard icon={ClipboardListIcon} label="Needs Screening" value={needsScreening.toLocaleString()} />
        <KpiCard icon={SendIcon} label="Forwarded / Escalated (history)" value={forwardedOrEscalated.toLocaleString()} />
      </div>

      <p className="text-sm text-muted-foreground">Median time to acknowledge (last 30 days): <strong>{metricDuration(counts.medianAcknowledgmentHours30d)}</strong></p>

      <Card className="@container gap-0 rounded-xl bg-muted pt-2 pb-5">
        <CardHeader className="px-4 pb-2">
          <CardHeaderRow>
            <CardTitle className="text-xs font-medium text-muted-foreground">Recent Incoming Reports</CardTitle>
            <InboxIcon aria-hidden="true" className="size-5 shrink-0 text-[var(--brand)]" />
          </CardHeaderRow>
        </CardHeader>
        <CardBodyPanel>
          <Table className="text-[13px]">
            <TableCaption className="sr-only">Incoming reports, newest first, with routing and Operational Priority.</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TABLE_HEAD_CLASS + " pl-4"} scope="col">Report</TableHead>
                <TableHead className={TABLE_HEAD_CLASS} scope="col">Barangay</TableHead>
                <TableHead className={TABLE_HEAD_CLASS} scope="col">Routed To</TableHead>
                <TableHead className={TABLE_HEAD_CLASS} scope="col">Op. Priority</TableHead>
                <TableHead className={TABLE_HEAD_CLASS} scope="col">Intake State</TableHead>
                <TableHead className={TABLE_HEAD_CLASS} scope="col">Submitted</TableHead>
                <TableHead className={TABLE_HEAD_CLASS + " pr-4 text-end"} scope="col">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow className="hover:bg-transparent"><TableCell className="p-0" colSpan={7}><EmptyState className="p-6" title="No incoming reports right now." /></TableCell></TableRow>
              ) : (
                reports.map((report) => {
                  return (
                    <TableRow className="hover:bg-[var(--brand-subtle)]" key={report.reportId}>
                      <TableCell className="max-w-56 py-2.5 pl-4">
                        <span className="block truncate font-medium" title={report.category}>{report.category}</span>
                        <div className="text-xs text-muted-foreground">{report.reportReference}</div>
                      </TableCell>
                      <TableCell className="max-w-40 py-2.5">
                        <span className="block truncate" title={report.barangayName}>{report.barangayName}</span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="secondary">{report.routedOffice}</Badge>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap ${priorityBandClass(report.operationalPriority)}`}>
                          {priorityBandLabel(report.operationalPriority).toUpperCase()} <span className="mx-1 opacity-60">&middot;</span> <span className="font-mono tabular-nums">{report.operationalPriority ?? "—"}</span>
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
          <nav aria-label="Incoming reports pages" className="flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-muted-foreground">{reportsPage.total.toLocaleString()} reports / Page {reportsPage.page} of {Math.max(1, Math.ceil(reportsPage.total / reportsPage.pageSize))}</span>
            <div className="flex gap-2">
              {reportsPage.page > 1 && <Button asChild size="sm" variant="outline"><Link href={pageHref(reportsPage.page - 1)}>Previous</Link></Button>}
              {reportsPage.page * reportsPage.pageSize < reportsPage.total && <Button asChild size="sm" variant="outline"><Link href={pageHref(reportsPage.page + 1)}>Next</Link></Button>}
            </div>
          </nav>
        </CardBodyPanel>
      </Card>
    </div>
  );
}
