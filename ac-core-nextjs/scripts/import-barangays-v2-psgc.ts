import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";
import { MUNICIPALITY } from "../lib/municipality-config";

// Source: PH_Adm4_BgySubMuns shapefile from altcoder/philippines-psgc-shapefiles
// (OCHA-derived, refined against PSA's PSGC), filtered to the target
// municipality (see lib/municipality-config.ts) and saved as
// MUNICIPALITY.psgcDataFile at repo root.
// Raw coordinates are in EPSG:32651 (UTM Zone 51N) — reprojected to 4326
// here, confirmed necessary after the shapefile's .prj revealed this.
//
// This creates barangays_v2 as a NEW table alongside the existing
// GADM-sourced `barangays` — nothing is overwritten yet. See PLAN.md §4.1.

interface PsgcFeature {
  type: "Feature";
  properties: { adm4_en: string; adm3_psgc: number };
  geometry: { type: string; coordinates: unknown };
}

function ringToWkt(ring: [number, number][]): string {
  return ring.map(([x, y]) => `${x} ${y}`).join(", ");
}
function polygonToWkt(coords: [number, number][][]): string {
  return "(" + coords.map((ring) => `(${ringToWkt(ring)})`).join(", ") + ")";
}
function geomToWkt(geom: { type: string; coordinates: unknown }): string {
  if (geom.type === "Polygon") {
    return "POLYGON" + polygonToWkt(geom.coordinates as [number, number][][]);
  }
  if (geom.type === "MultiPolygon") {
    const coords = geom.coordinates as [number, number][][][];
    return "MULTIPOLYGON(" + coords.map(polygonToWkt).join(", ") + ")";
  }
  throw new Error(`Unexpected geometry type: ${geom.type}`);
}

async function main() {
  const path = join(__dirname, "..", "..", MUNICIPALITY.psgcDataFile);
  const raw = JSON.parse(readFileSync(path, "utf8")) as { features: PsgcFeature[] };

  if (raw.features.length !== MUNICIPALITY.barangayCount) {
    console.error(`Expected ${MUNICIPALITY.barangayCount} features, got ${raw.features.length}.`);
    process.exit(1);
  }

  await sql`DROP TABLE IF EXISTS barangays_v2`;
  await sql`
    CREATE TABLE barangays_v2 (
      id serial PRIMARY KEY,
      name text NOT NULL,
      geom geometry(MultiPolygon, 4326) NOT NULL
    )
  `;
  await sql`CREATE INDEX barangays_v2_geom_idx ON barangays_v2 USING GIST (geom)`;

  for (const f of raw.features) {
    const wkt = geomToWkt(f.geometry);
    await sql`
      INSERT INTO barangays_v2 (name, geom)
      VALUES (
        ${f.properties.adm4_en},
        ST_Transform(ST_SetSRID(ST_GeomFromText(${wkt}, 32651), 32651), 4326)
      )
    `;
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM barangays_v2`;
  const [{ extent }] = await sql`SELECT ST_Extent(geom)::text AS extent FROM barangays_v2`;
  console.log(`Imported ${count} barangays into barangays_v2.`);
  console.log(`Bounding box: ${extent}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
