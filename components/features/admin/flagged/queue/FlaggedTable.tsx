"use client";

import { ShieldAlertIcon } from "lucide-react";
import type { ModerationQueueRow } from "@/lib/types/admin-moderation";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "../../shared/AdminErrorCard";
import { EmptyState } from "../../shared/EmptyState";
import { TABLE_HEAD_CLASS } from "../../shared/tableHead";
import {
  alignClass,
  gridTemplate,
  flaggedMinWidth,
  visibleColumns,
  FLAGGED_DENSITY_PADDING,
  type FlaggedColumnVisibility,
  type FlaggedDensity,
} from "./columns";
import { FlaggedRow } from "./FlaggedRow";
import type { HeaderCheckboxState } from "./useFlaggedSelection";

// A CSS grid, not a <table> — same reasoning as the Ticket Queue's table: fixed
// px tracks are what fit the nine columns at 1440px without sideways scrolling,
// and a <table> re-derives widths from content, so one long category name would
// push the Action column off-screen.
//
// Grid rows are not table rows to assistive tech, so the grid carries explicit
// role="table"/"row"/"columnheader" semantics and the header cells stay real
// text rather than styled divs with no accessible name.
export function FlaggedTable({
  reports,
  columnVisibility,
  density,
  loading,
  error,
  onRetry,
  isSelected,
  onToggleSelect,
  headerState,
  onToggleAll,
  focusedId,
  onFocusRow,
  onReview,
  skeletonRows,
}: {
  reports: ModerationQueueRow[];
  columnVisibility: FlaggedColumnVisibility;
  density: FlaggedDensity;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isSelected: (id: number) => boolean;
  onToggleSelect: (id: number) => void;
  headerState: HeaderCheckboxState;
  onToggleAll: () => void;
  focusedId: number | null;
  onFocusRow: (id: number) => void;
  onReview: (id: number) => void;
  skeletonRows: number;
}) {
  const columns = visibleColumns(columnVisibility);
  const gridTemplateColumns = gridTemplate(columnVisibility);
  const padding = FLAGGED_DENSITY_PADDING[density];
  const minWidth = flaggedMinWidth(columnVisibility);

  if (error) {
    return (
      <div className="p-4">
        <AdminErrorCard
          detail={error}
          message="The flagged report list could not be refreshed."
          onRetry={onRetry}
          title="Could not load flagged reports"
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* The scroll lives INSIDE the card, never on the page body: fixed tracks
          cannot compress, so below minWidth the choice is a scrollbar here or a
          collapsed Report column. Header and rows share one scroll container so
          they can never slide out of alignment. */}
      <div className="hidden overflow-x-auto md:block">
        <div aria-label="Flagged reports queue" role="table" style={{ minWidth }}>
          <div
            className={`grid items-center gap-2 border-b border-border bg-[var(--color-surface-subtle)] px-3 ${TABLE_HEAD_CLASS} h-[34px] whitespace-nowrap`}
            role="row"
            style={{ gridTemplateColumns }}
          >
            {/* Wrapped so every child of the header row is a columnheader; the
                role cannot go on the control itself without clobbering the one
                that makes it announce as a checkbox. */}
            <span role="columnheader">
              <Checkbox
                aria-label="Select all flagged reports on this page"
                checked={headerState}
                onCheckedChange={onToggleAll}
              />
            </span>
            {columns
              .filter((column) => column.key !== "select")
              .map((column) => (
                <span className={alignClass(column)} key={column.key} role="columnheader">
                  {column.label}
                </span>
              ))}
          </div>

          {loading ? (
            <SkeletonRows
              columnCount={columns.length}
              gridTemplateColumns={gridTemplateColumns}
              rows={skeletonRows}
            />
          ) : reports.length === 0 ? (
            <EmptyState description="Try widening your search or clearing filters." icon={ShieldAlertIcon} title="No flagged reports match this filter." />
          ) : (
            reports.map((report) => (
              <FlaggedRow
                columnVisibility={columnVisibility}
                focused={focusedId === report.id}
                gridTemplateColumns={gridTemplateColumns}
                key={report.id}
                onFocus={() => onFocusRow(report.id)}
                onReview={() => onReview(report.id)}
                onToggleSelect={() => onToggleSelect(report.id)}
                padding={padding}
                report={report}
                selected={isSelected(report.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Below md the grid collapses to a stacked list: nine fixed tracks
          cannot fit a phone, and a horizontally-scrolling table is worse than a
          re-flowed one. */}
      <div className="divide-y divide-border md:hidden">
        {loading ? (
          Array.from({ length: Math.min(skeletonRows, 8) }).map((_, i) => (
            <div className="space-y-2 px-4 py-3" key={i}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))
        ) : reports.length === 0 ? (
          <EmptyState description="Try widening your search or clearing filters." icon={ShieldAlertIcon} title="No flagged reports match this filter." />
        ) : (
          reports.map((report) => (
            <MobileRow
              key={report.id}
              onReview={() => onReview(report.id)}
              onToggleSelect={() => onToggleSelect(report.id)}
              report={report}
              selected={isSelected(report.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SkeletonRows({
  rows,
  columnCount,
  gridTemplateColumns,
}: {
  rows: number;
  columnCount: number;
  gridTemplateColumns: string;
}) {
  return (
    <>
      {Array.from({ length: Math.min(rows, 15) }).map((_, rowIndex) => (
        <div
          className="grid items-center gap-2 border-b border-muted px-3 py-[9px]"
          key={rowIndex}
          style={{ gridTemplateColumns }}
        >
          {Array.from({ length: columnCount }).map((__, cellIndex) => (
            <Skeleton className="h-4 w-full max-w-24" key={cellIndex} />
          ))}
        </div>
      ))}
    </>
  );
}

// A flat row inside the shared panel, not a card of its own — stacking cards
// inside a card doubles the border noise on the narrowest screen.
function MobileRow({
  report,
  selected,
  onToggleSelect,
  onReview,
}: {
  report: ModerationQueueRow;
  selected: boolean;
  onToggleSelect: () => void;
  onReview: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        aria-label={`Select report ${report.id}`}
        checked={selected}
        className="mt-1"
        onCheckedChange={onToggleSelect}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <button
          className="block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline"
          onClick={onReview}
          type="button"
        >
          {report.title}
        </button>
        <p className="font-mono text-xs text-muted-foreground">
          #{report.id} &middot; T#{report.ticket_id}
        </p>
        <p className="text-xs text-muted-foreground">
          {report.barangay_name} &middot; {report.assigned_office} &middot;{" "}
          {new Date(report.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
