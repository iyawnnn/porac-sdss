// Pure constants/types — ported from lib/admin/ticketConstants.ts. Next's
// copy stays in place until Phase 9 (client components import it directly).
export type TicketStatus = 'Reported' | 'Under Review' | 'In Progress' | 'Resolved' | 'Rejected';
export type TicketSort = 'priority_desc' | 'priority_asc' | 'newest';

export const TICKET_STATUSES: TicketStatus[] = [
  'Reported',
  'Under Review',
  'In Progress',
  'Resolved',
  'Rejected',
];
export const PAGE_LIMITS = [10, 15, 25, 50] as const;
export const DEFAULT_PAGE_LIMIT = 15;

// Linear status ladder — ported from app/api/admin/tickets/[id]/status/route.ts.
export const NEXT_STATUS: Record<string, TicketStatus> = {
  Reported: 'Under Review',
  'Under Review': 'In Progress',
  'In Progress': 'Resolved',
};
