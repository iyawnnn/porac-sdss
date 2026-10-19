// getPublicHazardMapData was ported to
// api/src/reports/reports.service.ts (NestJS) — see PLAN blueprint Phase
// 6/8. This file now only carries the row/response shapes that client
// components still `import type`.
import type { Geometry } from "geojson";

// The privacy-limited public map row (manuscript Appendix L, Citizen Web-GIS
// Map; manuscript revision Phase 1, step 6d) — matches
// api/src/reports/reports.service.ts's PublicTicketGeoRow exactly. No title,
// photo, reporter or system score; lat/lng arrive already rounded to 3
// decimals (about 100 m) by the server, so the pin is approximate.
export interface PublicTicketGeoRow {
  id: number;
  category: string;
  status: string;
  barangay_name: string;
  lat: number;
  lng: number;
  reported_at: string;
  last_updated_at: string;
  assigned_office: "MEO" | "MDRRMO";
  // The signed-in citizen's own report id for this ticket, if any — lets the
  // popup link to their private /dashboard/reports/[id] status page without
  // exposing that route for reports they don't own.
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
