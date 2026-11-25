import Link from "next/link";
import { ArrowUpRight, ChevronRight, CircleCheck, FileText, MapPinned, Plus, Timer } from "lucide-react";
import type { MyReportRow, MyReportsPage } from "@/lib/types/citizens-reports";
import type { BarangayGeoFeatureCollection, PublicTicketGeoRow } from "@/lib/types/citizens-public-map";
import { timeAgo } from "@/lib/utils/time-ago";
import { getCategoryMarkerSpec, glyphColor } from "@/lib/gis/category-spec";
import { StatusPill, summarizeCounts } from "@/components/features/citizen/reports/report-ui";
import PublicMapClientLoader from "@/components/features/citizen/map/PublicMapClientLoader";
import { AboutMapPopover } from "@/components/features/citizen/map/AboutMapPopover";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// The map is the page's hero: about 560-680px on desktop, following viewport height. Phones keep the
// map itself free of overlays (title and disclaimer sit outside it), so it can be a little shorter.
export const MAP_HEIGHT = "h-[24rem] min-[400px]:h-[26rem] sm:h-[30rem] md:h-[34rem] lg:h-[clamp(34rem,calc(100dvh-13rem),42.5rem)]";
const DISCLAIMER = "Reported concerns only. Not a hazard or risk map.";
// On tablets the third panel spans both columns instead of sitting alone at half width.
export const COMMUNITY_SPAN = "md:col-span-2 lg:col-span-1";
const PANEL = "flex min-w-0 flex-col rounded-xl border border-border bg-card";
// Every row and footer in every panel shares one height, so the three panels line up row for row.
const ROW = "flex min-h-16 items-center gap-3 px-5";
const FOOTER = "mt-auto flex min-h-12 items-center border-t border-border px-5 text-sm text-muted-foreground";
const dateFormat = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const formatCount = (count: number) => count.toLocaleString("en-PH");

/* ── Shared panel frame: title and action in the header, rows below ───────── */

function Panel({ id, title, action, className, children }: {
  id: string;
  title: string;
  action?: { href: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn(PANEL, className)}>
      <div className="flex min-h-13 items-center justify-between gap-3 border-b border-border ps-5 pe-3">
        <Text as="h2" id={id} variant="label" className="min-w-0">{title}</Text>
        {action && (
          <Link href={action.href} className="group inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground">
            {action.label}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// A row's leading mark: an icon on a soft tile, so labels in all three panels start on the same line.
function RowIcon({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" style={style}>
      {children}
    </span>
  );
}

/* ── Map ──────────────────────────────────────────────────────────────────── */

// Phones: title and count above the map, disclaimer below it, so nothing floats over a small map.
// From sm up the same content is the map's own top-right panel (PublicMapClient).
export function CommunityMap({ barangays, tickets }: { barangays: BarangayGeoFeatureCollection; tickets: PublicTicketGeoRow[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <div className="min-w-0">
          <Text as="h2" variant="label">Public Report Map</Text>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{formatCount(tickets.length)}</span>{" "}
            {tickets.length === 0 ? "active public reports right now" : "active public reports"}
          </p>
        </div>
        <AboutMapPopover className="size-11 shrink-0" />
      </div>
      <section aria-label="Public Report Map" className={cn("isolate min-w-0 overflow-hidden rounded-xl border border-border bg-muted", MAP_HEIGHT)}>
        <PublicMapClientLoader barangays={barangays} tickets={tickets} heightClassName="h-full" preview />
      </section>
      <p className="text-xs text-muted-foreground sm:hidden">{DISCLAIMER}</p>
    </div>
  );
}

/* ── Panel 1: My Reports ──────────────────────────────────────────────────── */

export function MyReportsPanel({ counts }: { counts: MyReportsPage["counts"] }) {
  const { total, active, resolved, rejected } = summarizeCounts(counts);
  const rows = [
    { label: "Total submitted", value: total, icon: <FileText className="size-3.5" />, tone: undefined },
    { label: "Active", value: active, icon: <Timer className="size-3.5" />, tone: "in-progress" },
    { label: "Resolved", value: resolved, icon: <CircleCheck className="size-3.5" />, tone: "resolved" },
  ];
  const note =
    total === 0 ? "Nothing submitted yet."
    : rejected > 0 ? `Total includes ${formatCount(rejected)} not accepted.`
    : active > 0 ? "Active reports are still being handled."
    : "Nothing waiting on review right now.";

  return (
    <Panel id="my-reports" title="My Reports" action={{ href: "/reports", label: "View all reports" }}>
      <dl aria-label="Report summary" className="divide-y divide-border">
        {rows.map(({ label, value, icon, tone }) => (
          <div key={label} className={ROW}>
            <dt className="flex flex-1 items-center gap-3 text-sm">
              <RowIcon style={tone ? { background: `var(--color-status-${tone}-tint)`, color: `var(--color-status-${tone}-ink)` } : undefined}>{icon}</RowIcon>
              {label}
            </dt>
            <dd data-slot="kpi-value" className="text-lg font-semibold tracking-tight tabular-nums">{formatCount(value)}</dd>
          </div>
        ))}
      </dl>
      <p className={FOOTER}>{note}</p>
    </Panel>
  );
}

/* ── Panel 2: Recent Reports ──────────────────────────────────────────────── */

const RECENT_COUNT = 3;

// Recent submissions (newest first), not status-change events: the rows are reports, not a feed.
export function RecentReportsPanel({ reports, total }: { reports: MyReportRow[]; total: number }) {
  const latest = reports.slice(0, RECENT_COUNT);
  return (
    <Panel id="recent-reports" title="Recent Reports">
      {latest.length === 0 ? (
        <Empty className="flex-1 gap-3 px-5 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>Seen a damaged road, blocked drainage or a fallen tree? Report it and follow its progress here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" className="h-10 gap-1.5 px-4 active:not-aria-[haspopup]:translate-y-0">
              <Link href="/report"><Plus aria-hidden="true" />Report a hazard</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="divide-y divide-border">
          {latest.map((report) => (
            <li key={report.id}>
              <Link
                href={`/dashboard/reports/${report.id}`}
                className={cn(ROW, "group py-2.5 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-offset-[-3px]")}
              >
                <div className="min-w-0 flex-1">
                  <Text variant="label" truncate>{report.title}</Text>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusPill status={report.status} />
                    <span className="truncate">{report.barangay_name}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={report.created_at} title={dateFormat.format(new Date(report.created_at))} className="shrink-0">{timeAgo(report.created_at)}</time>
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {latest.length > 0 && (
        <p className={FOOTER}>
          {total > RECENT_COUNT ? `Newest ${RECENT_COUNT} of ${formatCount(total)}` : "Open a report for its full timeline."}
        </p>
      )}
    </Panel>
  );
}

/* ── Panel 3: Top Reported Categories ─────────────────────────────────────── */

const TOP_COUNT = 3;

// From the privacy-limited active public reports; ties break alphabetically so the order is stable.
export function TopCategoriesPanel({ tickets }: { tickets: PublicTicketGeoRow[] }) {
  const counts = new Map<string, number>();
  for (const ticket of tickets) counts.set(ticket.category, (counts.get(ticket.category) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_COUNT);

  return (
    <Panel id="top-categories" title="Top Reported Categories" action={{ href: "/map", label: "Explore map" }} className={COMMUNITY_SPAN}>
      {top.length === 0 ? (
        <Empty className="flex-1 gap-3 px-5 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MapPinned aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No active public reports</EmptyTitle>
            <EmptyDescription>When residents report concerns, the most common categories appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="divide-y divide-border">
          {top.map(([category, count]) => {
            const { icon: Glyph, color } = getCategoryMarkerSpec(category);
            return (
              <li key={category} className={ROW}>
                <RowIcon style={{ background: color, borderRadius: 9999 }}>
                  <Glyph color={glyphColor(color)} size={14} strokeWidth={2.25} />
                </RowIcon>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={category}>{category}</span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {formatCount(count)}
                  <span className="sr-only"> active reports</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {top.length > 0 && <p className={FOOTER}>From active public reports across Porac.</p>}
    </Panel>
  );
}

/* ── Skeletons: same frames as the content they stand in for ──────────────── */

export function MapSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-44 motion-reduce:animate-none" />
        </div>
        <Skeleton className="size-11 rounded-md motion-reduce:animate-none" />
      </div>
      <Skeleton className={cn("rounded-xl motion-reduce:animate-none", MAP_HEIGHT)} />
      <Skeleton className="h-3.5 w-64 max-w-full motion-reduce:animate-none sm:hidden" />
    </div>
  );
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn(PANEL, className)}>
      <div className="flex min-h-13 items-center border-b border-border px-5"><Skeleton className="h-4 w-28 motion-reduce:animate-none" /></div>
      <div className="divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className={ROW}>
            <Skeleton className="size-7 rounded-lg motion-reduce:animate-none" />
            <Skeleton className="h-4 flex-1 motion-reduce:animate-none" />
            <Skeleton className="h-5 w-8 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <div className={FOOTER}><Skeleton className="h-4 w-3/4 motion-reduce:animate-none" /></div>
    </div>
  );
}
