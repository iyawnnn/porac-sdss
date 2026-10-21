// Public update line for the citizen public map's "Selected report" panel.
//
// An implementation extension: the manuscript's Appendix L wireframe (Citizen
// Web-GIS Map) shows a "Public update" line, but the manuscript defines no
// stored field for it. Until there is one, this returns a fixed, public-safe
// message per status (manuscript revision Phase 1, step 6d). A staff-authored
// public update would replace it in a later phase.
export function publicUpdateForStatus(status: string): string {
  switch (status) {
    case "Reported":
      return "Received and awaiting municipal review.";
    case "Under Review":
      return "The municipality is reviewing this concern.";
    case "In Progress":
      return "Municipal action is in progress.";
    default:
      return "Status update unavailable.";
  }
}
