import { sql } from "@/lib/db/raw";

export async function findNearestElevation(lat: number, lng: number) {
  const [row] = await sql<{ elevation_m: number }[]>`
    SELECT elevation_m
    FROM dem_points
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
    LIMIT 1
  `;
  return row.elevation_m;
}
