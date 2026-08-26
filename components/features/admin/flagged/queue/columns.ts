// The Flagged Reports queue's column model — the single source of truth for
// its grid, exactly as tickets/queue/columns.ts is for the Ticket Queue.
//
// Deliberately a second, local model rather than a generalization of that one:
// the two surfaces share a visual grammar, not a row shape. A generic column
// model would have to be parameterized over both key unions and both row types,
// and every future flagged-only column (Flags, Moderation) would widen a type
// the Ticket Queue also depends on. What IS shared lives in
// shared/tableHead.ts — the head style, which is a constant, not a shape.
//
// Same invariant as the queue: the header row, every data row and the loading
// skeleton all lay out from gridTemplate(), so adding a column here updates all
// three surfaces at once.

export type FlaggedColumnKey =
  | "select"
  | "report"
  | "flags"
  | "category"
  | "barangay"
  | "office"
  | "submitted"
  | "moderation"
  | "action";

export interface FlaggedColumn {
  key: FlaggedColumnKey;
  // Header label. Empty for the checkbox column, which is labelled by its own
  // aria-label instead.
  label: string;
  track: string;
  align?: "right" | "center";
  // Columns the toolbar's column menu may hide. Select, report and action are
  // structural — hiding them would leave rows unselectable, unlabelled or
  // unreviewable.
  hideable: boolean;
  minPx: number;
}

export const FLAGGED_COLUMNS: FlaggedColumn[] = [
  { key: "select", label: "", track: "34px", hideable: false, minPx: 34 },
  { key: "report", label: "Report", track: "minmax(240px,1fr)", hideable: false, minPx: 240 },
  { key: "flags", label: "Flags", track: "150px", hideable: true, minPx: 150 },
  { key: "category", label: "Category", track: "150px", hideable: true, minPx: 150 },
  { key: "barangay", label: "Barangay", track: "110px", hideable: true, minPx: 110 },
  { key: "office", label: "Office", track: "64px", hideable: true, minPx: 64 },
  { key: "submitted", label: "Submitted", track: "80px", hideable: true, minPx: 80 },
  { key: "moderation", label: "Moderation", track: "110px", hideable: true, minPx: 110 },
  { key: "action", label: "Action", track: "56px", align: "right", hideable: false, minPx: 56 },
];

export const HIDEABLE_FLAGGED_COLUMNS = FLAGGED_COLUMNS.filter((c) => c.hideable);

export type FlaggedColumnVisibility = Partial<Record<FlaggedColumnKey, boolean>>;

export function isColumnVisible(
  visibility: FlaggedColumnVisibility,
  key: FlaggedColumnKey,
): boolean {
  return visibility[key] !== false;
}

export function visibleColumns(visibility: FlaggedColumnVisibility): FlaggedColumn[] {
  return FLAGGED_COLUMNS.filter((c) => isColumnVisible(visibility, c.key));
}

// Built as an inline style, not a Tailwind class: the tracks are data, and
// Tailwind cannot generate a class for a string it never sees at build time.
export function gridTemplate(visibility: FlaggedColumnVisibility = {}): string {
  return visibleColumns(visibility)
    .map((c) => c.track)
    .join(" ");
}

// Row vertical padding by density — the same 9px/5px pair the Ticket Queue
// uses, so a Comfortable row is 40px on both surfaces and an admin moving
// between them does not see the rhythm change.
export const FLAGGED_DENSITY_PADDING = { comfortable: "9px", compact: "5px" } as const;
export type FlaggedDensity = keyof typeof FLAGGED_DENSITY_PADDING;

// Horizontal gap between tracks and the grid's own left+right padding, in px.
// Declared here rather than only in the Tailwind classes because
// flaggedMinWidth has to add them to the track total — a min-width that forgot
// the gaps lets the last column clip at exactly the breakpoint it protects.
export const FLAGGED_COLUMN_GAP_PX = 8;
export const FLAGGED_ROW_PADDING_PX = 24;

// The width below which the table scrolls inside its own card instead of
// squeezing. Fixed tracks cannot compress: without this floor the flexible
// Report column absorbs the whole shortfall and collapses.
export function flaggedMinWidth(visibility: FlaggedColumnVisibility = {}): number {
  const columns = visibleColumns(visibility);
  const tracks = columns.reduce((sum, c) => sum + c.minPx, 0);
  const gaps = Math.max(0, columns.length - 1) * FLAGGED_COLUMN_GAP_PX;
  return tracks + gaps + FLAGGED_ROW_PADDING_PX;
}

// Text alignment for a column, resolved in one place so the header row and the
// data cell can never disagree about it (they live in different files).
export function alignClass(column: FlaggedColumn): string | undefined {
  if (column.align === "right") return "text-right";
  if (column.align === "center") return "text-center";
  return undefined;
}
