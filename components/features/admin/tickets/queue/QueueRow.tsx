"use client";

import Link from "next/link";
import { ChevronDownIcon, EllipsisIcon, PanelRightOpenIcon } from "lucide-react";
import type { AdminTicketRow } from "@/lib/types/admin-tickets";
import { getUrgencyBadgeConfig } from "@/lib/utils/ui/urgency";
import { relativeAge } from "@/lib/utils/ui/time";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TICKET_STATUS_STYLE } from "../../shared/StatusPill";
import { isColumnVisible, type QueueColumnKey, type QueueColumnVisibility } from "./columns";
import { UrgencyMeter } from "./UrgencyMeter";

// The linear status ladder, mirroring NEXT_STATUS in
// api/src/admin/ticket-constants.ts. Duplicated here for the same reason
// lib/utils/urgency.ts duplicates the scoring math: this copy only decides what
// the row's menu OFFERS. The server re-derives the real transition and is the
// only thing that can perform it, so a drifted copy can mislabel a menu item
// but can never cause an illegal transition.
const NEXT_STATUS: Record<string, string> = {
  Reported: "Under Review",
  "Under Review": "In Progress",
  "In Progress": "Resolved",
};

// The citizen-dispute flag reuses the rejected status tokens rather than raw
// palette classes, which docs/design-system.md §7 bans for semantic color.
const DISPUTED_BADGE_CLASS =
  "inline-flex h-[17px] items-center rounded-[4px] bg-status-rejected-tint px-1.5 text-[10px] font-semibold tracking-[0.04em] uppercase whitespace-nowrap text-status-rejected-ink";

export function QueueRow({
  ticket,
  detailHref,
  selected,
  focused,
  padding,
  columnVisibility,
  gridTemplateColumns,
  onToggleSelect,
  onAdvanceStatus,
  onFocus,
}: {
  ticket: AdminTicketRow;
  detailHref: string;
  selected: boolean;
  focused: boolean;
  padding: string;
  columnVisibility: QueueColumnVisibility;
  gridTemplateColumns: string;
  onToggleSelect: () => void;
  onAdvanceStatus: () => void;
  onFocus: () => void;
}) {
  const urgencyBadge = getUrgencyBadgeConfig(ticket.priority_score);
  const statusStyle = TICKET_STATUS_STYLE[ticket.status] ?? TICKET_STATUS_STYLE.Reported;
  const nextStatus = NEXT_STATUS[ticket.status];
  const show = (key: QueueColumnKey) => isColumnVisible(columnVisibility, key);

  return (
    <div
      className={`grid items-center gap-2 border-b border-muted px-3 transition-colors hover:bg-[var(--brand-wash)] ${
        selected ? "bg-[var(--brand-wash)] shadow-[inset_2px_0_0_var(--brand)]" : ""
      } ${focused ? "outline outline-2 -outline-offset-2 outline-ring" : ""}`}
      data-ticket-row={ticket.id}
      data-urgency-score={ticket.priority_score ?? ""}
      onMouseDown={onFocus}
      role="row"
      style={{ gridTemplateColumns, paddingTop: padding, paddingBottom: padding }}
    >
      {/* Every direct child of the grid is a cell. The checkbox gets a wrapper
          rather than role="cell" on the control itself, which would clobber the
          role that makes it announce as a checkbox. */}
      <span role="cell">
        <Checkbox
          aria-label={`Select ticket ${ticket.id}`}
          checked={selected}
          onCheckedChange={onToggleSelect}
        />
      </span>

      <div className="min-w-0" role="cell">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            className="line-clamp-2 text-[13px] leading-[17px] font-medium hover:text-primary hover:underline"
            href={detailHref}
            title={ticket.title ?? undefined}
          >
            {ticket.title ?? `Ticket #${ticket.id}`}
          </Link>
          {ticket.disputed_at && <span className={DISPUTED_BADGE_CLASS}>Disputed</span>}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">#{ticket.id}</div>
      </div>

      {show("category") && (
        <span className="line-clamp-2 text-xs leading-[15px] text-muted-foreground" role="cell" title={ticket.category}>
          {ticket.category}
        </span>
      )}

      {show("barangay") && (
        <span className="truncate text-[13px]" role="cell" title={ticket.barangay_name}>
          {ticket.barangay_name}
        </span>
      )}

      {show("members") && (
        <span className="text-center font-mono text-[13px] tabular-nums text-muted-foreground" role="cell">
          {ticket.member_count}
        </span>
      )}

      {show("urgency") && (
        <span className="flex justify-center" role="cell">
          <UrgencyMeter priorityScore={ticket.priority_score} />
        </span>
      )}

      {show("level") && (
        <span role="cell">
          <span
            className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap ${urgencyBadge.className}`}
          >
            {urgencyBadge.label}
          </span>
        </span>
      )}

      {show("office") && (
        <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground" role="cell">
          {ticket.assigned_office}
        </span>
      )}

      {show("status") && (
        <span role="cell">
          {/* The chevron opens ONE legal step, not a status picker: the server's
              advanceStatus only ever moves a ticket to NEXT_STATUS[current], and
              Resolved additionally needs a proof photo that a row menu cannot
              collect -- so that step sends the admin to the detail page. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap"
                style={{ background: statusStyle.tint, color: statusStyle.ink }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: statusStyle.dot }}
                />
                {ticket.status}
                <ChevronDownIcon aria-hidden="true" className="size-3 opacity-55" strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {nextStatus === "Resolved" ? (
                <DropdownMenuItem asChild>
                  <Link href={detailHref}>Resolve (needs photo)</Link>
                </DropdownMenuItem>
              ) : nextStatus ? (
                <DropdownMenuItem onSelect={onAdvanceStatus}>Advance to {nextStatus}</DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>No transition available</DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={detailHref}>Open ticket</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}

      {show("created") && (
        <span role="cell">
          <span className="block text-xs text-muted-foreground">
            {new Date(ticket.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="block text-[11px] text-muted-foreground/80">
            {relativeAge(ticket.created_at, ticket.status)}
          </span>
        </span>
      )}

      <span className="flex items-center justify-end gap-0.5 text-muted-foreground" role="cell">
        <Link
          aria-label={`Open ticket ${ticket.id}`}
          className="flex size-[26px] items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
          href={detailHref}
        >
          <PanelRightOpenIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`More actions for ticket ${ticket.id}`}
              className="flex size-[26px] items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
              type="button"
            >
              <EllipsisIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link href={detailHref}>Open ticket</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleSelect}>
              {selected ? "Deselect" : "Select"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
