// GET /admin/tickets/:id/related-candidates and
// GET /admin/intake/:reportId/related-candidates (api/src/admin/
// related-tickets.service.ts; manuscript revision Phase 3, steps 3c-3d).

// Why a Merge / Move is not available, in the server's own words; null when
// it is (api/src/admin/ticket-grouping.rules.ts decides both).
export interface RelatedTicketBlockedReasons {
  // Merge the candidate into the viewed ticket (the viewed one survives).
  mergeIntoViewed: string | null;
  // Merge the viewed ticket into the candidate.
  mergeViewedInto: string | null;
  // Move one of the viewed ticket's reports to the candidate.
  moveReportHere: string | null;
}

export interface RelatedTicketCandidate {
  ticketId: number;
  category: string;
  status: string;
  assignedOffice: "MEO" | "MDRRMO";
  barangayName: string;
  distanceM: number;
  memberCount: number;
  createdAt: string;
  reportedAt: string | null;
  trackingReference: string | null;
  firstReportId: number | null;
  blockedReasons: RelatedTicketBlockedReasons;
}

export interface RelatedTicketCandidates {
  radiusM: number;
  viewed: {
    ticketId: number;
    createdAt: string;
    reportCount: number;
    mergedIntoTicketId: number | null;
    blockedReasons: { removeReport: string | null };
  };
  candidates: RelatedTicketCandidate[];
}

// POST /admin/ticket-grouping/{merge,remove-report,regroup-report}
// (manuscript revision Phase 3, step 3d).
export interface MergeTicketsResult {
  survivorTicketId: number;
  mergedTicketId: number;
  movedReportIds: number[];
}

export interface RemoveReportResult {
  reportId: number;
  fromTicketId: number;
  newTicketId: number;
}

export interface RegroupReportResult {
  reportId: number;
  fromTicketId: number;
  toTicketId: number;
}
