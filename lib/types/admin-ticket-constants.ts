// Pure constants/types, safe to import from client components (no DB
// import) — see lib/admin/tickets.ts for the server-only query functions.
export type TicketStatus = "Reported" | "Under Review" | "In Progress" | "Resolved" | "Rejected";
// Operational Priority (priority_index) is the only score-based order;
// 'op_priority_desc' is the default. The Hazard Urgency sorts
// ('priority_desc'/'priority_asc') were retired in manuscript revision
// Phase 1, step 4 — see api/src/admin/ticket-constants.ts (the mirrored copy).
export type TicketSort = "op_priority_desc" | "op_priority_asc" | "newest";

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
  "Damaged Manhole Cover",
  "Clogged Drainage / Damaged Culvert",
  "Streetlight Out",
  "Localized Flooding",
  "Rain-Induced Slope Failure/Landslide",
  "Lahar or Volcanic Debris-Flow Threat",
  "Fallen Tree or Storm-Related Road Obstruction",
  "Illegal Dumping Affecting Drainage or Road",
  "Overgrown Vegetation Obstructing Road or Signage",
  "Leaking Pipe / Water Supply Concern",
  "Other Minor Infrastructure Hazard",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// Retired category strings, still valid on historical tickets. Not
// rendered as dropdown options (a legacy category isn't something you'd pick
// for a new ticket), but ALL_TICKET_CATEGORIES below is used to validate a
// `?category=` query param so a deep link to a legacy-categorized filter
// still works instead of silently resetting. Mirrors api/src/contracts/
// schemas.ts's LEGACY_CATEGORIES — the last four were retired in manuscript
// revision Phase 2, step 2a (Decisions 6, 9, 13; see that file).
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
  "Drainage / Culvert / Manhole Issue",
  "Landslide / Slope Failure",
  "Lahar / Debris-Flow Threat",
  "Fallen Tree / Storm-Related Obstruction",
] as const;
export const ALL_TICKET_CATEGORIES = [...TICKET_CATEGORIES, ...LEGACY_TICKET_CATEGORIES] as const;

// Deliberate duplicate of api/src/contracts/schemas.ts's OPERATIONAL_CONSTRAINTS
// (Batch 3: Operational Assessment) — same lib/<->api boundary rationale as
// TICKET_CATEGORIES above. Order matches the approved form layout.
export const OPERATIONAL_CONSTRAINTS = [
  "weather",
  "manpower",
  "equipment",
  "materials",
  "funding",
  "approvals",
  "procurement",
  "jurisdiction",
  "safety",
  "external_coordination",
  "technical_feasibility",
  "other",
] as const;
export type OperationalConstraint = (typeof OPERATIONAL_CONSTRAINTS)[number];

export const OPERATIONAL_CONSTRAINT_LABEL: Record<OperationalConstraint, string> = {
  weather: "Weather",
  manpower: "Manpower",
  equipment: "Equipment",
  materials: "Materials",
  funding: "Funding",
  approvals: "Approvals",
  procurement: "Procurement",
  jurisdiction: "Jurisdiction",
  safety: "Safety",
  external_coordination: "External Coordination",
  technical_feasibility: "Technical Feasibility",
  other: "Other",
};
