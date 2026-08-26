// The Ticket Queue's column model — the single source of truth for the grid.
//
// The queue's table is a CSS grid, not a <table>: the Precision Queue design
// fits all ten columns at 1440px with no horizontal scroll, which needs fixed
// px tracks that a <table>'s auto-layout will not honor. That means the header
// row, every data row, and the loading skeleton must all lay out on the SAME
// grid-template-columns string or they visibly disagree — so the string is
// generated from this list rather than written out three times.
//
// This also retires the manual invariant TicketQueueSkeleton used to carry
// (COLUMN_COUNT had to be hand-synced with the real table, per
// docs/design-system.md §5.5). The skeleton now imports gridTemplate() and
// QUEUE_COLUMNS directly, so adding a column here updates all three surfaces.

export type QueueColumnKey =
  | "select"
  | "ticket"
  | "category"
  | "barangay"
  | "members"
  | "urgency"
  | "level"
  | "office"
  | "status"
  | "created"
  | "action";

export interface QueueColumn {
  key: QueueColumnKey;
  // Header label. Empty for the checkbox column, which is labelled by its own
  // aria-label instead — a visible "Select" head would waste the 34px track.
  label: string;
  // CSS grid track. Only `ticket` flexes; every other column is fixed so the
  // total is predictable at 1440px.
  track: string;
  align?: "right" | "center";
  // Columns the user may hide from the toolbar's column menu. The select,
  // ticket and action columns are structural — hiding them would leave rows
  // unselectable, unlabelled or unopenable.
  hideable: boolean;
  // Width this column occupies when the grid is at its narrowest. Equal to the
  // fixed track for every fixed column; for the one flexible column it is the
  // floor of its minmax(). Summed by queueMinWidth() to decide when the table
  // starts scrolling instead of squeezing.
  minPx: number;
}

export const QUEUE_COLUMNS: QueueColumn[] = [
  { key: "select", label: "", track: "34px", hideable: false, minPx: 34 },
  { key: "ticket", label: "Ticket", track: "minmax(200px,1fr)", hideable: false, minPx: 200 },
  { key: "category", label: "Category", track: "132px", hideable: true, minPx: 132 },
  { key: "barangay", label: "Barangay", track: "96px", hideable: true, minPx: 96 },
  { key: "members", label: "Members", track: "64px", align: "center", hideable: true, minPx: 64 },
  { key: "urgency", label: "Urgency", track: "96px", align: "center", hideable: true, minPx: 96 },
  { key: "level", label: "Level", track: "70px", hideable: true, minPx: 70 },
  { key: "office", label: "Office", track: "56px", hideable: true, minPx: 56 },
  { key: "status", label: "Status", track: "118px", hideable: true, minPx: 118 },
  { key: "created", label: "Created", track: "86px", hideable: true, minPx: 86 },
  { key: "action", label: "Action", track: "56px", align: "right", hideable: false, minPx: 56 },
];

export const HIDEABLE_QUEUE_COLUMNS = QUEUE_COLUMNS.filter((c) => c.hideable);

export type QueueColumnVisibility = Partial<Record<QueueColumnKey, boolean>>;

export function isColumnVisible(
  visibility: QueueColumnVisibility,
  key: QueueColumnKey,
): boolean {
  return visibility[key] !== false;
}

export function visibleColumns(visibility: QueueColumnVisibility): QueueColumn[] {
  return QUEUE_COLUMNS.filter((c) => isColumnVisible(visibility, c.key));
}

// Built as an inline style rather than a Tailwind class: the tracks are data,
// and Tailwind cannot generate a class for a string it never sees at build
// time (an arbitrary-value class assembled at runtime is not in the JIT's
// scan set and silently produces no CSS).
export function gridTemplate(visibility: QueueColumnVisibility = {}): string {
  return visibleColumns(visibility)
    .map((c) => c.track)
    .join(" ");
}

// Row vertical padding by density. The design's Comfortable/Compact toggle is
// exactly this pair — 9px gives ~40px rows, 5px gives ~32px, which are the
// bounds docs/design-system.md §5.5 sets for admin table rows.
export const QUEUE_DENSITY_PADDING = { comfortable: "9px", compact: "5px" } as const;
export type QueueDensity = keyof typeof QUEUE_DENSITY_PADDING;

// Horizontal gap between tracks and the grid's own left+right padding, in px.
// Declared here rather than only in the Tailwind classes because queueMinWidth
// has to add them to the track total — a min-width that forgot the gaps lets
// the last column clip at exactly the breakpoint it was meant to protect.
export const QUEUE_COLUMN_GAP_PX = 8;
export const QUEUE_ROW_PADDING_PX = 24;

// The width below which the table scrolls horizontally inside its own card
// instead of squeezing. Ten fixed tracks cannot compress: without this floor
// the flexible Ticket column absorbs the entire shortfall and collapses to a
// few pixels, which is what happened at the admin shell's real content width
// (~960px) versus the 1440px full-frame width the design was drawn at.
//
// Hiding columns from the toolbar's column menu lowers this number, so the
// menu is the real escape hatch on a narrow screen.
export function queueMinWidth(visibility: QueueColumnVisibility = {}): number {
  const columns = visibleColumns(visibility);
  const tracks = columns.reduce((sum, c) => sum + c.minPx, 0);
  const gaps = Math.max(0, columns.length - 1) * QUEUE_COLUMN_GAP_PX;
  return tracks + gaps + QUEUE_ROW_PADDING_PX;
}

// Text alignment for a column, resolved in one place so the header row and the
// data cell can never disagree about it (they live in different files).
export function alignClass(column: QueueColumn): string | undefined {
  if (column.align === "right") return "text-right";
  if (column.align === "center") return "text-center";
  return undefined;
}
