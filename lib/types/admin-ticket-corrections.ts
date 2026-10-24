// GET /admin/ticket-corrections/:id and the two correction actions
// (api/src/admin/ticket-corrections.service.ts; manuscript revision Phase 3,
// step 3e). Blocked reasons are the server's own messages.
export interface CorrectionAvailability {
  ticketId: number;
  category: string;
  assignedOffice: "MEO" | "MDRRMO";
  lat: number;
  lng: number;
  barangayName: string;
  // Why this viewer can't correct the ticket at all; null when they can.
  blocked: string | null;
  // Why a category of the other office is refused (an active Work Order).
  officeChangeBlocked: string | null;
  // The current categories with the office each one routes to.
  categories: { category: string; office: "MEO" | "MDRRMO" }[];
}

export interface CategoryCorrectionResult {
  ticketId: number;
  category: string;
  assignedOffice: "MEO" | "MDRRMO";
  officeChanged: boolean;
}

export interface LocationCorrectionResult {
  ticketId: number;
  lat: number;
  lng: number;
  barangayName: string;
  distanceM: number;
}
