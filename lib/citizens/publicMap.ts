import type { Geometry } from "geojson";
import { sql } from "@/lib/db/raw";

export interface PublicTicketGeoRow {
  id: number;
  category: string;
  status: string;
  barangay_name: string;
  urgency_band: string | null;
  urgency_score: number | null;
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

export async function getPublicHazardMapData(citizenId: number) {
  const [barangays, tickets] = await Promise.all([
    sql<{ id: number; name: string; geojson: string }[]>`
      SELECT id, name, ST_AsGeoJSON(geom) AS geojson FROM barangays ORDER BY name
    `,
    sql<PublicTicketGeoRow[]>`
      SELECT
        t.id, t.category, t.status, b.name AS barangay_name,
        t.urgency_band, t.urgency_score, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        r.title, r.image_url, own.id AS own_report_id
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN LATERAL (
        SELECT title, image_url FROM reports
        WHERE reports.ticket_id = t.id
        ORDER BY reports.id ASC
        LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT id FROM reports
        WHERE reports.ticket_id = t.id AND reports.citizen_id = ${citizenId}
        ORDER BY reports.id ASC
        LIMIT 1
      ) own ON true
      WHERE t.status IN ('Reported', 'In Progress')
        AND COALESCE(t.flagged, false) = false
      ORDER BY t.created_at DESC
    `,
  ]);

  const barangayGeo: BarangayGeoFeatureCollection = {
    type: "FeatureCollection",
    features: barangays.map((barangay) => ({
      type: "Feature",
      properties: { id: barangay.id, name: barangay.name },
      geometry: JSON.parse(barangay.geojson) as Geometry,
    })),
  };

  return { barangays: barangayGeo, tickets };
}
