// Focal's municipality-wide intake surface — a separate concept from
// AdminTicketRow/PaginatedTickets (the operational Ticket Queue's own
// shape). Mirrors api/src/admin/focal-intake.service.ts's response DTOs.
export type IntakeState = "New" | "Acknowledged" | "Screened" | "Forwarded" | "Escalated";
// Appendix H REPORTS severity_screening_status (manuscript Table 2;
// manuscript revision Phase 3, step 3f). Mirrors api/src/db/schema.ts.
export type SeverityScreeningStatus = "NOT_REVIEWED" | "NO_CONCERN_NOTED" | "REQUIRES_OPERATIONAL_VALIDATION";
export type SeverityScreeningOutcome = Exclude<SeverityScreeningStatus, "NOT_REVIEWED">;

export interface SeverityScreening {
  status: SeverityScreeningStatus;
  remarks: string | null;
  screenedByName: string | null;
  screenedAt: string | null;
  // null while Focal may screen; else why not (the API's own 409 message).
  blockedReason: string | null;
}

export interface FocalIntakeRow {
  reportId: number;
  reportReference: string;
  ticketId: number;
  ticketReference: string;
  category: string;
  ticketStatus: string;
  routedOffice: "MEO" | "MDRRMO";
  memberCount: number;
  barangayName: string;
  citizenSeverity: string;
  submittedAt: string;
  flags: string[];
  // Operational Priority (priority_index). The Hazard Urgency field was
  // removed in manuscript revision Phase 1, step 6b.
  operationalPriority: number | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  intakeState: IntakeState;
  // Not yet screened, on an active, not merged-away ticket; acknowledgment
  // plays no part (manuscript revision Phase 3, step 3f).
  needsScreening: boolean;
}

export interface IntakeActivityRow {
  actionType: string;
  actorName: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface FocalIntakeDetail extends FocalIntakeRow {
  description: string | null;
  lat: number;
  lng: number;
  linkedTicketReference: string;
  activity: IntakeActivityRow[];
  // Manuscript revision Phase 3, step 3e: lat/lng above are the citizen's
  // pin; these are the ticket's current location and the category the
  // citizen picked (category is the ticket's current one). Staff
  // corrections change only the ticket.
  ticketLat: number;
  ticketLng: number;
  submittedCategory: string;
  // Focal severity screening (manuscript revision Phase 3, step 3f).
  severityScreening: SeverityScreening;
}

// Batch 4's Focal-safe read-only map source (GET /admin/intake/geo) — a
// deliberately narrow, separate shape from FocalIntakeRow/FocalIntakeDetail:
// only what a map pin needs (never Operational Assessment content, Work
// Order internals, or staff assignment). Mirrors
// api/src/admin/focal-intake.service.ts's FocalIntakeGeoRow. Pins carry
// Operational Priority since manuscript revision Phase 1, step 6b (Hazard
// Urgency before).
export interface FocalIntakeGeoRow {
  reportId: number;
  reportReference: string;
  category: string;
  barangayName: string;
  routedOffice: "MEO" | "MDRRMO";
  operationalPriority: number | null;
  lat: number;
  lng: number;
  intakeState: IntakeState;
}
