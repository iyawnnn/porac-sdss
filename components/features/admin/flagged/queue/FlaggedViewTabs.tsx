"use client";

import { BookmarkPlusIcon, XIcon } from "lucide-react";
import type { ModerationStats } from "@/lib/types/admin-moderation";
// One SavedView shape for both surfaces: the row is identical (id, name, query,
// position) and the server returns it from the same endpoint. A second
// interface here would be the same definition written twice.
import type { SavedView } from "@/lib/types/admin-tickets";

export type BuiltInFlaggedViewKey = "all" | "pending" | "quarantined" | "dismissed" | "duplicate";

export interface BuiltInFlaggedView {
  key: BuiltInFlaggedViewKey;
  label: string;
  count: number;
}

// Counts come from GET /admin/moderation/stats, which counts by
// moderation_status with the same predicate each tab filters on — "All flagged"
// is their sum rather than a separate query, because every flagged report is in
// exactly one of the four states (pending being the absence of a decision).
//
// Saved views append after these WITHOUT counts, exactly as on the Ticket
// Queue: counting an arbitrary saved filter would mean one aggregate query per
// preset on every page load, and a wrong count is worse than no count.
export function buildBuiltInFlaggedViews(stats: ModerationStats): BuiltInFlaggedView[] {
  const all = stats.pending + stats.quarantined + stats.dismissed + stats.duplicate;
  return [
    { key: "all", label: "All flagged", count: all },
    { key: "pending", label: "Pending review", count: stats.pending },
    { key: "quarantined", label: "Quarantined", count: stats.quarantined },
    { key: "dismissed", label: "Dismissed", count: stats.dismissed },
    { key: "duplicate", label: "Duplicates", count: stats.duplicate },
  ];
}

export function FlaggedViewTabs({
  views,
  savedViews,
  activeKey,
  activeSavedViewId,
  onSelectBuiltIn,
  onSelectSaved,
  onDeleteSaved,
  onSaveCurrent,
}: {
  views: BuiltInFlaggedView[];
  savedViews: SavedView[];
  activeKey: BuiltInFlaggedViewKey | null;
  activeSavedViewId: number | null;
  onSelectBuiltIn: (key: BuiltInFlaggedViewKey) => void;
  onSelectSaved: (view: SavedView) => void;
  onDeleteSaved: (view: SavedView) => void;
  onSaveCurrent: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border">
      {views.map((view) => {
        const active = view.key === activeKey;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-[7px] pb-2.5 text-[13px] whitespace-nowrap transition-colors ${
              active
                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--brand)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={view.key}
            onClick={() => onSelectBuiltIn(view.key)}
            type="button"
          >
            {view.label}
            <span
              className={`inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[5px] font-mono text-[10px] tabular-nums ${
                active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}
            >
              {view.count}
            </span>
          </button>
        );
      })}

      {savedViews.map((view) => {
        const active = view.id === activeSavedViewId;
        return (
          <span className="group inline-flex items-center gap-1 pb-2.5" key={view.id}>
            <button
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center text-[13px] whitespace-nowrap transition-colors ${
                active
                  ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--brand)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onSelectSaved(view)}
              type="button"
            >
              {view.name}
            </button>
            <button
              aria-label={`Delete saved view ${view.name}`}
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
              onClick={() => onDeleteSaved(view)}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-3" strokeWidth={2} />
            </button>
          </span>
        );
      })}

      <button
        className="mb-2 ml-auto inline-flex h-[26px] items-center gap-[5px] rounded-lg border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        onClick={onSaveCurrent}
        type="button"
      >
        <BookmarkPlusIcon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        Save this view
      </button>
    </div>
  );
}
