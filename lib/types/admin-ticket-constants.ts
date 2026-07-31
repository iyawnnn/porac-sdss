// Pure constants/types, safe to import from client components (no DB
// import) — see lib/admin/tickets.ts for the server-only query functions.
export type TicketStatus = "Reported" | "Under Review" | "In Progress" | "Resolved" | "Rejected";
export type TicketSort = "priority_desc" | "priority_asc" | "newest";

export const TICKET_STATUSES: TicketStatus[] = ["Reported", "Under Review", "In Progress", "Resolved", "Rejected"];
export const PAGE_LIMITS = [10, 15, 25, 50] as const;
export const DEFAULT_PAGE_LIMIT = 15;
