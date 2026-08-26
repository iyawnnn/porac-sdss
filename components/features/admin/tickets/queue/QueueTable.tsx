"use client";

import { SearchXIcon } from "lucide-react";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminErrorCard } from "../../shared/AdminErrorCard";
import { TABLE_HEAD_CLASS } from "../../shared/tableHead";
import {
  alignClass,
  gridTemplate,
  queueMinWidth,
  visibleColumns,
  type QueueColumnVisibility,
  type QueueDensity,
  QUEUE_DENSITY_PADDING,
} from "./columns";
import type { HeaderCheckboxState } from "./useQueueSelection";
import { QueueRow } from "./QueueRow";

// A CSS grid, not a <table>. The Precision Queue design fits all ten columns at
// 1440px with no sideways scrolling, which needs fixed px tracks that a table's
// auto-layout will not honor -- a <table> re-derives column widths from cell
// content, so one long category name would push the Action column off-screen.
//
// The tradeoff is that grid rows are not table rows to assistive tech, so the
// grid carries explicit role="table"/"row"/"columnheader" semantics and the
// header cells stay real text rather than styled divs with no accessible name.
//
// Below md the grid collapses to a stacked list: ten fixed tracks cannot fit a
// phone, and a horizontally-scrolling table is worse than a re-flowed one.
export function QueueTable({
  tickets,
  detailHref,
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
  onAdvanceStatus,
  skeletonRows,
}: {
  tickets: AdminTicketRow[];
  detailHref: (ticket: AdminTicketRow) => string;
  columnVisibility: QueueColumnVisibility;
  density: QueueDensity;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isSelected: (id: number) => boolean;
  onToggleSelect: (id: number) => void;
  headerState: HeaderCheckboxState;
  onToggleAll: () => void;
  focusedId: number | null;
  onFocusRow: (id: number) => void;
  onAdvanceStatus: (id: number) => void;
  skeletonRows: number;
}) {
  const columns = visibleColumns(columnVisibility);
  const gridTemplateColumns = gridTemplate(columnVisibility);
  const padding = QUEUE_DENSITY_PADDING[density];
  const minWidth = queueMinWidth(columnVisibility);

  if (error) {
    return (
      <div className="p-4">
        <AdminErrorCard
          message="The ticket list could not be refreshed."
          onRetry={onRetry}
          title="Could not load tickets"
          detail={error}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* The scroll lives INSIDE the card, never on the page body: the fixed
          tracks cannot compress, so below minWidth the choice is a scrollbar
          here or a collapsed Ticket column. Header and rows share one scroll
          container so they can never slide out of alignment. */}
      <div className="hidden overflow-x-auto md:block">
        <div aria-label="Ticket queue" role="table" style={{ minWidth }}>
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
              aria-label="Select all tickets on this page"
              checked={headerState}
              onCheckedChange={onToggleAll}
            />
          </span>
          {columns
            .filter((column) => column.key !== "select")
            .map((column) => (
              <span
                className={alignClass(column)}
                key={column.key}
                role="columnheader"
              >
                {column.label}
              </span>
            ))}
        </div>

        {loading ? (
          <SkeletonRows columnCount={columns.length} gridTemplateColumns={gridTemplateColumns} rows={skeletonRows} />
        ) : tickets.length === 0 ? (
          <EmptyState />
        ) : (
          tickets.map((ticket) => (
            <QueueRow
              columnVisibility={columnVisibility}
              detailHref={detailHref(ticket)}
              focused={focusedId === ticket.id}
              gridTemplateColumns={gridTemplateColumns}
              key={ticket.id}
              onAdvanceStatus={() => onAdvanceStatus(ticket.id)}
              onFocus={() => onFocusRow(ticket.id)}
              onToggleSelect={() => onToggleSelect(ticket.id)}
              padding={padding}
              selected={isSelected(ticket.id)}
              ticket={ticket}
            />
          ))
        )}
        </div>
      </div>

      <div className="divide-y divide-border md:hidden">
        {loading ? (
          Array.from({ length: Math.min(skeletonRows, 8) }).map((_, i) => (
            <div className="space-y-2 px-4 py-3" key={i}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))
        ) : tickets.length === 0 ? (
          <EmptyState />
        ) : (
          tickets.map((ticket) => (
            <MobileRow
              detailHref={detailHref(ticket)}
              key={ticket.id}
              onToggleSelect={() => onToggleSelect(ticket.id)}
              selected={isSelected(ticket.id)}
              ticket={ticket}
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

function EmptyState() {
  return (
    <div className="p-10 text-center">
      <SearchXIcon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No tickets match this filter.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try widening your search or clearing filters.</p>
    </div>
  );
}

// The mobile variant is a flat row inside the shared panel, not a card of its
// own -- stacking cards inside a card doubles the border noise on the narrowest
// screen. Same px-4/py-3 rhythm as the dashboard's list rows.
function MobileRow({
  ticket,
  detailHref,
  selected,
  onToggleSelect,
}: {
  ticket: AdminTicketRow;
  detailHref: string;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        aria-label={`Select ticket ${ticket.id}`}
        checked={selected}
        className="mt-1"
        onCheckedChange={onToggleSelect}
      />
      <MobileRowBody detailHref={detailHref} ticket={ticket} />
    </div>
  );
}

function MobileRowBody({ ticket, detailHref }: { ticket: AdminTicketRow; detailHref: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <a className="block truncate text-sm font-medium hover:text-primary hover:underline" href={detailHref}>
        {ticket.title ?? `Ticket #${ticket.id}`}
      </a>
      <p className="font-mono text-xs text-muted-foreground">
        #{ticket.id} &middot; {ticket.category}
      </p>
      <p className="text-xs text-muted-foreground">
        {ticket.barangay_name} &middot; {ticket.assigned_office} &middot; {ticket.status}
      </p>
    </div>
  );
}
