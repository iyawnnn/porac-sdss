import type { SeverityScreeningStatus } from "@/lib/types/admin-focal-intake";

// Labels for Focal's severity screening (manuscript Table 2; manuscript
// revision Phase 3, step 3f), shared by the Focal intake detail and the
// operational Ticket Detail. Staff-facing only.
export const SEVERITY_SCREENING_LABEL: Record<SeverityScreeningStatus, string> = {
  NOT_REVIEWED: "Not reviewed",
  NO_CONCERN_NOTED: "No concern noted",
  REQUIRES_OPERATIONAL_VALIDATION: "Requires operational validation",
};
