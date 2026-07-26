import { sql } from "@/lib/db/raw";

export async function findBarangayForPoint(lat: number, lng: number) {
  const rows = await sql<{ id: number; name: string }[]>`
    SELECT id, name
    FROM barangays
    WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    LIMIT 1
  `;
  return rows[0] ?? null;
}
