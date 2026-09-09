// Focal's municipality-wide intake surface — a separate concept from
// AdminTicketRow/PaginatedTickets (the operational Ticket Queue's own
// shape). Mirrors api/src/admin/focal-intake.service.ts's response DTOs.
export type IntakeState = "New" | "Acknowledged" | "Screened" | "Forwarded" | "Escalated";
export type ScreeningRecommendation = "continue" | "forward" | "escalate";

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
  hazardUrgency: { index: number | null; level: string | null };
  operationalPriority: number | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  intakeState: IntakeState;
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
  elevationM: number | null;
  linkedTicketReference: string;
  activity: IntakeActivityRow[];
}

// Batch 4's Focal-safe read-only map source (GET /admin/intake/geo) — a
// deliberately narrow, separate shape from FocalIntakeRow/FocalIntakeDetail:
// only what a map pin needs (never Operational Assessment content, Work
// Order internals, or staff assignment). Mirrors
// api/src/admin/focal-intake.service.ts's FocalIntakeGeoRow.
export interface FocalIntakeGeoRow {
  reportId: number;
  reportReference: string;
  category: string;
  barangayName: string;
  routedOffice: "MEO" | "MDRRMO";
  hazardUrgency: { index: number | null; level: string | null };
  lat: number;
  lng: number;
  intakeState: IntakeState;
}
