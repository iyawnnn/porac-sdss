import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";
import { MUNICIPALITY } from "../lib/municipality-config";

// Source: Overpass relation MUNICIPALITY.osmRelationId (admin_level=6),
// fetched manually via the Overpass API (admin_level=6, name~<city>) and
// saved as MUNICIPALITY.overpassBoundaryFile at repo root.
//
// That relation's own fixme tag reads: "confirm boundaries, currently
// includes Barangay Calibutbut of Bacolor". This import does NOT special-
// case that — and doesn't need to. This table is only ever used as an
// outer accept/reject envelope (lib/geo/barangay.ts: is the point inside
// Angeles City at all?), never as a source of barangay identity. Barangay
// assignment always comes from the GADM-derived `barangays` table, which
// never included Calibutbut as one of Angeles' 33 in the first place. So
// OSM's boundary-quality caveat about Calibutbut has no path into our
// barangay lookup regardless of whether it's baked into this outline.

interface OverpassWayMember {
  type: string;
  role: string;
  geometry?: { lat: number; lon: number }[];
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  members: OverpassWayMember[];
}

async function main() {
  const path = join(__dirname, "..", MUNICIPALITY.overpassBoundaryFile);
  const raw = JSON.parse(readFileSync(path, "utf8")) as { elements: OverpassElement[] };
  const relation = raw.elements.find((e) => e.type === "relation");
  if (!relation) throw new Error("No relation found in overpass_angeles_city.json");

  console.log(`Relation ${relation.id}: ${relation.tags?.name} (${relation.tags?.official_name})`);
  console.log(`fixme: ${relation.tags?.fixme ?? "(none)"}`);

  const outerWays = relation.members.filter(
    (m) => m.role === "outer" && Array.isArray(m.geometry) && m.geometry.length >= 2
  );
  console.log(`Outer ways with geometry: ${outerWays.length}`);

  const lineWkts = outerWays.map((w) => {
    const coords = w.geometry!.map((pt) => `${pt.lon} ${pt.lat}`).join(", ");
    return `LINESTRING(${coords})`;
  });

  // ST_Polygonize assembles polygon(s) from a set of (noded) linework —
  // more robust than hand-chaining way endpoints in JS, since OSM way
  // members aren't guaranteed to arrive in ring order.
  const [result] = await sql<{ geom: string; num_polygons: number }[]>`
    WITH lines AS (
      SELECT ST_GeomFromText(line, 4326) AS geom FROM unnest(${lineWkts}::text[]) AS line
    ),
    polygonized AS (
      SELECT ST_Polygonize(geom) AS geom FROM lines
    )
    SELECT
      ST_AsText(ST_Multi(ST_CollectionExtract(geom, 3))) AS geom,
      ST_NumGeometries(ST_CollectionExtract(geom, 3)) AS num_polygons
    FROM polygonized
  `;

  if (!result || result.num_polygons === 0) {
    throw new Error(
      "ST_Polygonize produced no polygons — the outer ways likely don't form a closed ring (gap in linework)."
    );
  }
  console.log(`Polygonize produced ${result.num_polygons} polygon(s).`);

  await sql`TRUNCATE city_boundary_osm RESTART IDENTITY`;
  const sourceLabel = `overpass relation ${MUNICIPALITY.osmRelationId} (admin_level=6, ${MUNICIPALITY.name})`;
  await sql`
    INSERT INTO city_boundary_osm (source, geom)
    VALUES (${sourceLabel}, ST_GeomFromText(${result.geom}, 4326))
  `;

  const [check] = await sql<{ area_km2: number; valid: boolean }[]>`
    SELECT ST_Area(geom::geography) / 1000000 AS area_km2, ST_IsValid(geom) AS valid
    FROM city_boundary_osm
  `;
  console.log(`Imported. Area: ${check.area_km2.toFixed(1)} km², valid geometry: ${check.valid}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
