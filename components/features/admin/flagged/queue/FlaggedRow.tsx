"use client";

import { useState } from "react";
import Link from "next/link";
import { EllipsisIcon, ImageOffIcon, PanelRightOpenIcon } from "lucide-react";
import type { ModerationQueueRow } from "@/lib/types/admin-moderation";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FlagBadge } from "../FlagBadge";
import { moderationStatusLabel } from "../flagText";
import { isColumnVisible, type FlaggedColumnKey, type FlaggedColumnVisibility } from "./columns";

// Moderation status is a different axis from flag type, and both appear in the
// same row — so their palettes must not collide (a rose "Quarantined" beside a
// rose "Photo authenticity" reads as one signal). Pending/Duplicate/Dismissed
// are dot-and-tint; Quarantined is the only solid fill.
//
// Values are `var(--color-status-*)` references rather than hex, for the same
// reason shared/StatusPill.tsx uses them: those five palettes have exactly one
// definition, in globals.css's @theme block.
const STATUS_STYLE: Record<string, { tint: string; ink: string; dot: string }> = {
  pending: {
    tint: "var(--color-status-under-review-tint)",
    ink: "var(--color-status-under-review-ink)",
    dot: "var(--color-status-under-review-dot)",
  },
  dismissed: {
    tint: "var(--color-status-resolved-tint)",
    ink: "var(--color-status-resolved-ink)",
    dot: "var(--color-status-resolved-dot)",
  },
  duplicate: {
    tint: "var(--color-status-reported-tint)",
    ink: "var(--color-status-reported-ink)",
    dot: "var(--color-status-reported-dot)",
  },
  // The only solid fill of the four, because quarantine is the only decision
  // that acts on the public map — it must not read as one more tinted state.
  quarantined: {
    tint: "var(--foreground)",
    ink: "var(--background)",
    dot: "var(--background)",
  },
};

function ModerationPill({ status }: { status: string | null }) {
  const key = status ?? "pending";
  const style = STATUS_STYLE[key] ?? STATUS_STYLE.pending;
  return (
    <span
      className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap"
      style={{ background: style.tint, color: style.ink }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: style.dot }}
      />
      {moderationStatusLabel(status)}
    </span>
  );
}

// The evidence photo at row scale. It falls back to an icon rather than a
// broken-image glyph because Cloudinary URLs on seeded/demo rows can 404, and a
// moderation queue that looks broken invites the wrong kind of doubt.
function RowThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        aria-label={`${alt} — image unavailable`}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
        role="img"
      >
        <ImageOffIcon aria-hidden="true" className="size-3.5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className="size-8 shrink-0 rounded-md border border-border object-cover"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}

// One flag badge plus an overflow count, never the full list: a report with
// four flags would otherwise wrap the row to three lines. The drawer shows
// every flag with its evidence, which is where a moderator decides anyway.
function FlagsCell({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <FlagBadge flag={flags[0]} size="compact" />
      {flags.length > 1 && (
        <span className="font-mono text-[11px] text-muted-foreground">+{flags.length - 1}</span>
      )}
    </span>
  );
}

export function FlaggedRow({
  report,
  selected,
  focused,
  padding,
  columnVisibility,
  gridTemplateColumns,
  onToggleSelect,
  onReview,
  onFocus,
}: {
  report: ModerationQueueRow;
  selected: boolean;
  focused: boolean;
  padding: string;
  columnVisibility: FlaggedColumnVisibility;
  gridTemplateColumns: string;
  onToggleSelect: () => void;
  onReview: () => void;
  onFocus: () => void;
}) {
  const show = (key: FlaggedColumnKey) => isColumnVisible(columnVisibility, key);

  return (
    <div
      className={`grid items-center gap-2 border-b border-muted px-3 transition-colors hover:bg-[var(--brand-wash)] ${
        selected ? "bg-[var(--brand-wash)] shadow-[inset_2px_0_0_var(--brand)]" : ""
      } ${focused ? "outline outline-2 -outline-offset-2 outline-ring" : ""}`}
      data-report-row={report.id}
      onMouseDown={onFocus}
      role="row"
      style={{ gridTemplateColumns, paddingTop: padding, paddingBottom: padding }}
    >
      {/* Every direct child of the grid is a cell. The checkbox gets a wrapper
          rather than role="cell" on the control itself, which would clobber the
          role that makes it announce as a checkbox. */}
      <span role="cell">
        <Checkbox
          aria-label={`Select report ${report.id}`}
          checked={selected}
          onCheckedChange={onToggleSelect}
        />
      </span>

      <div className="min-w-0" role="cell">
        <div className="flex min-w-0 items-center gap-2">
          <RowThumbnail alt={`Evidence photo for "${report.title}"`} src={report.image_url} />
          <div className="min-w-0">
            {/* A button, not a link: reviewing happens in the drawer beside the
                list, so the moderator keeps their filtered position. The ticket
                link in the drawer is the way out to a full page. */}
            <button
              className="block max-w-full truncate text-left text-[13px] leading-[17px] font-medium hover:text-primary hover:underline"
              onClick={onReview}
              title={report.title}
              type="button"
            >
              {report.title}
            </button>
            <div className="font-mono text-[11px] text-muted-foreground">
              #{report.id} &middot; T#{report.ticket_id}
            </div>
          </div>
        </div>
      </div>

      {show("flags") && (
        <span className="min-w-0" role="cell">
          <FlagsCell flags={report.flags} />
        </span>
      )}

      {show("category") && (
        <span
          className="line-clamp-2 text-xs leading-[15px] text-muted-foreground"
          role="cell"
          title={report.category}
        >
          {report.category}
        </span>
      )}

      {show("barangay") && (
        <span className="truncate text-[13px]" role="cell" title={report.barangay_name}>
          {report.barangay_name}
        </span>
      )}

      {show("office") && (
        <span
          className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground"
          role="cell"
        >
          {report.assigned_office}
        </span>
      )}

      {show("submitted") && (
        <span className="text-xs text-muted-foreground" role="cell">
          {new Date(report.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}

      {show("moderation") && (
        <span role="cell">
          <ModerationPill status={report.moderation_status} />
        </span>
      )}

      <span className="flex items-center justify-end gap-0.5 text-muted-foreground" role="cell">
        <button
          aria-label={`Review report ${report.id}`}
          className="flex size-[26px] items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
          onClick={onReview}
          type="button"
        >
          <PanelRightOpenIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`More actions for report ${report.id}`}
              className="flex size-[26px] items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
              type="button"
            >
              <EllipsisIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onReview}>Review evidence</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/admin/tickets/${report.ticket_id}`}>Open ticket #{report.ticket_id}</Link>
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
