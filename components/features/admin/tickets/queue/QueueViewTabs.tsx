"use client";

import { BookmarkPlusIcon, XIcon } from "lucide-react";
import type { SavedView, TicketViewCounts } from "@/lib/types/admin-tickets";

// Identifies which built-in tab (if any) the current filter state matches.
// `null` means the filters are ad-hoc and no tab is underlined — deliberately
// not "fall back to All active", which would claim a preset the admin is not
// actually looking at.
export type BuiltInViewKey = "allActive" | "highUrgency" | "disputed" | "meo" | "mdrrmo";

export interface BuiltInView {
  key: BuiltInViewKey;
  label: string;
  count: number;
}

// The built-in tabs are hardcoded, and their counts come from the server
// (viewCounts on the list response) counted with the SAME predicate each tab
// applies. Saved views append after them WITHOUT counts on purpose: counting an
// arbitrary saved filter would mean one aggregate query per preset on every
// page load, and a wrong count is worse than no count.
export function buildBuiltInViews(
  counts: TicketViewCounts,
  { showOfficeTabs }: { showOfficeTabs: boolean },
): BuiltInView[] {
  const views: BuiltInView[] = [
    { key: "allActive", label: "All active", count: counts.allActive },
    { key: "highUrgency", label: "High urgency", count: counts.highUrgency },
    { key: "disputed", label: "Disputed", count: counts.disputed },
  ];
  // An office admin sees only their own office, so an MEO/MDRRMO split would
  // be one tab holding everything and one permanently at zero.
  if (showOfficeTabs) {
    views.push({ key: "meo", label: "MEO", count: counts.meo });
    views.push({ key: "mdrrmo", label: "MDRRMO", count: counts.mdrrmo });
  }
  return views;
}

export function QueueViewTabs({
  views,
  savedViews,
  activeKey,
  activeSavedViewId,
  onSelectBuiltIn,
  onSelectSaved,
  onDeleteSaved,
  onSaveCurrent,
}: {
  views: BuiltInView[];
  savedViews: SavedView[];
  activeKey: BuiltInViewKey | null;
  activeSavedViewId: number | null;
  onSelectBuiltIn: (key: BuiltInViewKey) => void;
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
