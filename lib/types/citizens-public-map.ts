// getPublicHazardMapData was ported to
// api/src/reports/reports.service.ts (NestJS) — see PLAN blueprint Phase
// 6/8. This file now only carries the row/response shapes that client
// components still `import type`.
import type { Geometry } from "geojson";

// The privacy-limited public map row (manuscript Appendix L, Citizen Web-GIS
// Map; handoff Decision 8; manuscript revision Phase 6, step 6a) — matches
// api/src/reports/reports.service.ts's PublicTicketGeoRow exactly. Only the
// category, status, barangay, pin and reported date: no ticket number,
// tracking reference, title, photo, reporter, last-updated time, assigned
// office or system score. lat/lng arrive already rounded to 3 decimals
// (about 100 m) by the server, so the pin is approximate.
export interface PublicTicketGeoRow {
  // Opaque per-response position key ("p1", "p2", ...) — only for React
  // keys within one response. It is not an id and can name a different
  // ticket in the next response.
  key: string;
  category: string;
  status: string;
  barangay_name: string;
  lat: number;
  lng: number;
  reported_at: string;
  // The signed-in citizen's own report id for this ticket, if any — lets the
  // popup link to their private /dashboard/reports/[id] status page without
  // exposing that route for reports they don't own. Null on everyone
  // else's tickets.
  own_report_id: number | null;
}

export interface BarangayGeoFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: number; name: string };
    geometry: Geometry;
  }>;
}
