// Pure constants/types, safe to import from client components (no DB
// import) — see lib/admin/tickets.ts for the server-only query functions.
export type TicketStatus = "Reported" | "Under Review" | "In Progress" | "Resolved" | "Rejected";
export type TicketSort = "priority_desc" | "priority_asc" | "newest";

export const TICKET_STATUSES: TicketStatus[] = ["Reported", "Under Review", "In Progress", "Resolved", "Rejected"];
export const PAGE_LIMITS = [10, 15, 25, 50] as const;
export const DEFAULT_PAGE_LIMIT = 15;

// Deliberate duplicate of api/src/contracts/schemas.ts's CATEGORIES — same
// rationale as lib/municipality-config.ts's duplication (CLAUDE.md): a pure
// frontend constant can't import across the lib/<->api DB boundary.
export const TICKET_CATEGORIES = [
  "Flooding",
  "Clogged Drain",
  "Fallen Tree",
  "Pothole",
  "Uneven Sidewalk",
  "Streetlight Out",
  "Leaking Pipe",
  "Uncollected Garbage",
  "Illegal Dumping",
  "Overgrown Vegetation",
  "Other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
