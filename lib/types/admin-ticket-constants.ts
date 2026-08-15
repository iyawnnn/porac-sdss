// Pure constants/types, safe to import from client components (no DB
// import) — see lib/admin/tickets.ts for the server-only query functions.
export type TicketStatus = "Reported" | "Under Review" | "In Progress" | "Resolved" | "Rejected";
export type TicketSort = "priority_desc" | "priority_asc" | "newest";

export const TICKET_STATUSES: TicketStatus[] = ["Reported", "Under Review", "In Progress", "Resolved", "Rejected"];
export const PAGE_LIMITS = [10, 15, 25, 50] as const;
export const DEFAULT_PAGE_LIMIT = 15;

// Deliberate duplicate of api/src/contracts/schemas.ts's CATEGORIES — same
// rationale as lib/municipality-config.ts's duplication (CLAUDE.md): a pure
// frontend constant can't import across the lib/<->api DB boundary. This is
// the set new tickets get created with, and what admin filter dropdowns
// render as clickable options.
export const TICKET_CATEGORIES = [
  "Pothole / Road Surface Damage",
  "Uneven Sidewalk",
  "Drainage / Culvert / Manhole Issue",
  "Streetlight Out",
  "Localized Flooding",
  "Landslide / Slope Failure",
  "Lahar / Debris-Flow Threat",
  "Fallen Tree / Storm-Related Obstruction",
  "Illegal Dumping Affecting Drainage or Road",
  "Overgrown Vegetation Obstructing Road or Signage",
  "Leaking Pipe / Water Supply Concern",
  "Other Minor Infrastructure Hazard",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// Pre-Phase-3-follow-up category strings, still valid on historical
// tickets. Not rendered as dropdown options (a legacy category isn't
// something you'd pick for a new ticket), but ALL_TICKET_CATEGORIES below
// is used to validate a `?category=` query param so a deep link to a
// legacy-categorized filter still works instead of silently resetting.
export const LEGACY_TICKET_CATEGORIES = [
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
export const ALL_TICKET_CATEGORIES = [...TICKET_CATEGORIES, ...LEGACY_TICKET_CATEGORIES] as const;
