import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { MyReportsPage } from "@/lib/types/citizens-reports";
import { StatusPill, reportDateFormat } from "@/components/features/citizen/reports/report-ui";
import { ProgressTracker } from "@/components/features/citizen/reports/ProgressTracker";
import { ReportThumbnail } from "@/components/features/citizen/reports/ReportThumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

type Report = MyReportsPage["items"][number];

// A compact tracking card: what and where at the top, progress in the middle, reference and action
// at the bottom. Explanations of each status live on the detail page, not here.
export function ReportCard({ report }: { report: Report }) {
  return (
    <Link
      href={`/dashboard/reports/${report.id}`}
      aria-label={`View Details: ${report.title}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-card transition-colors duration-150 hover:border-foreground/20"
    >
      <div className="flex gap-3.5 p-4 sm:p-5">
        <ReportThumbnail src={report.image_url || null} category={report.category} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <Text as="h2" variant="label" className="line-clamp-2 [overflow-wrap:anywhere]">{report.title}</Text>
            <StatusPill status={report.status} className="mt-px" />
          </div>
          <p className="truncate text-xs text-muted-foreground">{report.category}</p>
          <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{report.barangay_name}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              <time dateTime={report.created_at}>{reportDateFormat.format(new Date(report.created_at))}</time>
            </span>
          </p>
        </div>
      </div>

      <div className="mx-4 border-t border-border px-1 pt-4 pb-4 sm:mx-5 sm:pb-5">
        <ProgressTracker status={report.status} reached={report.reached_statuses ?? []} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 rounded-b-xl border-t border-border bg-muted/30 px-4 py-2.5 sm:px-5">
        <span className="truncate font-mono text-xs text-muted-foreground">{report.tracking_reference}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground">
          View details
          <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:group-hover:translate-x-0" />
        </span>
      </div>
    </Link>
  );
}

// Same frame as ReportCard: thumbnail and text, the four tracker nodes, the footer strip.
export function ReportCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex gap-3.5 p-4 sm:p-5">
        <Skeleton className="size-16 shrink-0 rounded-lg motion-reduce:animate-none" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
            <Skeleton className="h-5 w-20 rounded-full motion-reduce:animate-none" />
          </div>
          <Skeleton className="h-3 w-2/5 motion-reduce:animate-none" />
          <Skeleton className="mt-auto h-3 w-1/2 motion-reduce:animate-none" />
        </div>
      </div>
      <div className="mx-4 flex justify-between border-t border-border px-6 py-4 sm:mx-5 sm:pb-5">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="size-5 rounded-full motion-reduce:animate-none" />)}
      </div>
      <div className="flex justify-between border-t border-border px-4 py-3 sm:px-5">
        <Skeleton className="h-3.5 w-32 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
