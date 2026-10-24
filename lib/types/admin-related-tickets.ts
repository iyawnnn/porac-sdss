// GET /admin/tickets/:id/related-candidates and
// GET /admin/intake/:reportId/related-candidates (api/src/admin/
// related-tickets.service.ts; manuscript revision Phase 3, step 3c).
export interface RelatedTicketCandidate {
  ticketId: number;
  category: string;
  status: string;
  assignedOffice: "MEO" | "MDRRMO";
  barangayName: string;
  distanceM: number;
  memberCount: number;
  reportedAt: string | null;
  trackingReference: string | null;
  firstReportId: number | null;
}

export interface RelatedTicketCandidates {
  radiusM: number;
  candidates: RelatedTicketCandidate[];
}
