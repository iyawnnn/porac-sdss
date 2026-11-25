import Link from "next/link";
import { FileText, Inbox, Plus } from "lucide-react";
import { apiGet, getCitizenSessionFromApi } from "@/lib/api-client";
import type { MyReportsPage } from "@/lib/types/citizens-reports";
import { CitizenUnauthorized } from "@/components/features/citizen/dashboard/CitizenUnauthorized";
import { ReportCard } from "@/components/features/citizen/reports/ReportCard";
import { summarizeCounts } from "@/components/features/citizen/reports/report-ui";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Eight cards fill four rows of two on desktop; most citizens never see a second page.
const PAGE_SIZE = 8;
// Most citizens have a handful of reports, so the list is newest first with no filters; a bad page
// number falls back to page 1 instead of a 400.
function readPage(raw?: string) {
  return /^[1-9]\d{0,5}$/.test(raw ?? "") ? Number(raw) : 1;
}

const hrefFor = (page: number) => (page > 1 ? `/reports?page=${page}` : "/reports");

// 1 … 4 5 6 … 12: first, last and the current page's neighbours.
function pageWindow(current: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["gap", p] as const) : [p]));
}

const PAGE_LINK = "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors duration-150 hover:bg-muted";
const PAGE_DISABLED = "w-auto cursor-not-allowed px-2.5 text-muted-foreground/60 hover:bg-transparent";

export default async function MyReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getCitizenSessionFromApi();
  if (!session) return <CitizenUnauthorized />;

  const page = readPage((await searchParams).page);
  const data = await apiGet<MyReportsPage>(`/reports/mine/page?pageSize=${PAGE_SIZE}&page=${page}`);

  const { total: allCount, active, resolved, rejected } = summarizeCounts(data.counts);
  const summary = [
    `${allCount.toLocaleString("en-PH")} ${allCount === 1 ? "report" : "reports"}`,
    active > 0 && `${active.toLocaleString("en-PH")} in progress`,
    resolved > 0 && `${resolved.toLocaleString("en-PH")} resolved`,
    rejected > 0 && `${rejected.toLocaleString("en-PH")} not accepted`,
  ].filter(Boolean);
  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const firstShown = (data.page - 1) * PAGE_SIZE + 1;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Text as="h1" variant="heading">My Reports</Text>
          <Text variant="body-sm" color="muted" className="mt-1">
            {allCount > 0 ? summary.join(" · ") : "Follow each concern you reported, from submission to resolution."}
          </Text>
        </div>
        {/* With no reports the empty state carries the only "Report Hazard" action. */}
        {allCount > 0 && (
          <Button asChild className="h-11 shrink-0 gap-2 px-4 hover:bg-primary-hover active:bg-primary-pressed active:not-aria-[haspopup]:translate-y-0">
            <Link href="/report"><Plus aria-hidden="true" />Report Hazard</Link>
          </Button>
        )}
      </div>

      {allCount === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-card py-16 sm:py-20">
          <EmptyHeader className="max-w-md">
            <EmptyMedia variant="icon" className="size-12 rounded-xl bg-brand-subtle text-primary [&_svg]:size-6"><FileText aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-base">No reports yet</EmptyTitle>
            <EmptyDescription>
              Seen a damaged road, a blocked drain or another hazard? Report it with a photo and its location, then follow each step here until it is fixed.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild className="h-11 gap-2 px-5 hover:bg-primary-hover active:not-aria-[haspopup]:translate-y-0">
              <Link href="/report"><Plus aria-hidden="true" />Report Hazard</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <section aria-label="Your reports" className="flex flex-col gap-4">
          {data.items.length === 0 ? (
            <Empty className="rounded-xl border border-border bg-card py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>This page is empty</EmptyTitle>
                <EmptyDescription>There are fewer reports than this page number.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="outline" className="h-9 px-3">
                  <Link href="/reports">Go to the first page</Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {data.items.map((report) => (
                <li key={report.id} className="min-w-0">
                  <ReportCard report={report} />
                </li>
              ))}
            </ul>
          )}

          {lastPage > 1 && data.items.length > 0 && (
            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-between">
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {firstShown.toLocaleString("en-PH")}–{(firstShown + data.items.length - 1).toLocaleString("en-PH")} of {data.total.toLocaleString("en-PH")}
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    {data.page > 1 ? (
                      <Link href={hrefFor(data.page - 1)} aria-label="Previous page" className={cn(PAGE_LINK, "w-auto px-2.5")}>Previous</Link>
                    ) : (
                      <span aria-disabled="true" className={cn(PAGE_LINK, PAGE_DISABLED)}>Previous</span>
                    )}
                  </PaginationItem>
                  {pageWindow(data.page, lastPage).map((p, i) => (
                    <PaginationItem key={`${p}-${i}`} className="hidden sm:block">
                      {p === "gap" ? (
                        <PaginationEllipsis />
                      ) : (
                        <Link
                          href={hrefFor(p)}
                          aria-label={`Page ${p}`}
                          aria-current={p === data.page ? "page" : undefined}
                          className={cn(PAGE_LINK, p === data.page && "border border-border bg-card")}
                        >
                          {p}
                        </Link>
                      )}
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    {data.page < lastPage ? (
                      <Link href={hrefFor(data.page + 1)} aria-label="Next page" className={cn(PAGE_LINK, "w-auto px-2.5")}>Next</Link>
                    ) : (
                      <span aria-disabled="true" className={cn(PAGE_LINK, PAGE_DISABLED)}>Next</span>
                    )}
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
