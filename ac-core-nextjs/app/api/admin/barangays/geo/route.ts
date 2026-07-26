import { NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";

// Barangay polygons rarely change, so this doesn't need the recompute-on-load
// treatment the ticket geo route gets — it's static reference data.
export async function GET() {
  const rows = await sql<{ id: number; name: string; geojson: string }[]>`
    SELECT id, name, ST_AsGeoJSON(geom) AS geojson FROM barangays ORDER BY name
  `;

  const featureCollection = {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      properties: { id: r.id, name: r.name },
      geometry: JSON.parse(r.geojson),
    })),
  };

  return NextResponse.json(featureCollection);
}
