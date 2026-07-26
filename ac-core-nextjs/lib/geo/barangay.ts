import { sql } from "@/lib/db/raw";

export interface BarangayMatch {
  id: number;
  name: string;
  // true if this came from the nearest-within-city fallback rather than a
  // strict ST_Contains match against the barangay's own polygon.
  viaFallback: boolean;
  // distance in meters from the point to this barangay's polygon, only
  // populated when viaFallback is true (a strict ST_Contains match is 0 by
  // definition, not worth computing).
  fallbackDistanceM?: number;
}

export async function findBarangayForPoint(lat: number, lng: number): Promise<BarangayMatch | null> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

  const [exact] = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM barangays WHERE ST_Contains(geom, ${point}) LIMIT 1
  `;
  if (exact) return { ...exact, viaFallback: false };

  // GADM's barangay polygons have known small edge gaps (e.g. the
  // Sto. Domingo/Cutcut boundary — confirmed ~283m outside every GADM
  // polygon despite being a real in-city location). Fall back to OSM's
  // outer city boundary (city_boundary_osm) to decide "in Angeles City at
  // all", then snap to whichever GADM barangay is geometrically nearest.
  // OSM is used only for this outer accept/reject check — barangay
  // identity always comes from GADM's `barangays` table. This is
  // deliberate for Calibutbut specifically: OSM's Angeles City relation
  // carries an unresolved tag ("confirm boundaries, currently includes
  // Barangay Calibutbut of Bacolor"), but since Calibutbut was never one
  // of GADM's 33 Angeles barangays to begin with, that data-quality
  // caveat has no path into barangay assignment regardless.
  const [inCity] = await sql<{ in_city: boolean }[]>`
    SELECT ST_Contains(geom, ${point}) AS in_city FROM city_boundary_osm LIMIT 1
  `;
  if (!inCity?.in_city) return null;

  const [nearest] = await sql<{ id: number; name: string; distance_m: number }[]>`
    SELECT id, name, ST_Distance(geom::geography, ${point}::geography) AS distance_m
    FROM barangays ORDER BY geom <-> ${point} LIMIT 1
  `;
  return nearest
    ? { id: nearest.id, name: nearest.name, viaFallback: true, fallbackDistanceM: nearest.distance_m }
    : null;
}
