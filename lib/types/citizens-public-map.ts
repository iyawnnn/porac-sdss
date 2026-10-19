// getPublicHazardMapData was ported to
// api/src/reports/reports.service.ts (NestJS) — see PLAN blueprint Phase
// 6/8. This file now only carries the row/response shapes that client
// components still `import type`.
import type { Geometry } from "geojson";

export interface PublicTicketGeoRow {
  id: number;
  category: string;
  status: string;
  barangay_name: string;
  // urgency_band/urgency_score were removed in manuscript revision Phase 1,
  // step 6c — pins are neutral and citizens see no system score.
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
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
