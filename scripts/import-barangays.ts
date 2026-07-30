import { readFileSync } from "fs";
import { resolve } from "path";
import { sql } from "../lib/db/raw";
import { MUNICIPALITY } from "../lib/municipality-config";

type Feature = { properties: { name?: string }; geometry: { type: string; coordinates: unknown } };
function ring(r: [number, number][]) { return `(${r.map(([x,y]) => `${x} ${y}`).join(", ")})`; }
function wkt(g: Feature["geometry"]) { const c = g.coordinates as [number,number][][][]; if (g.type === "Polygon") return `MULTIPOLYGON((${(c as unknown as [number,number][][]).map(ring).join(", ")}))`; if (g.type === "MultiPolygon") return `MULTIPOLYGON(${c.map(p => `(${p.map(ring).join(", ")})`).join(", ")})`; throw new Error("Expected polygon geometry"); }
async function main() {
  const raw = JSON.parse(readFileSync(resolve(__dirname, "..", MUNICIPALITY.psgcDataFile), "utf8")) as { features: Feature[] };
  if (raw.features.length !== MUNICIPALITY.barangayCount) throw new Error(`Expected ${MUNICIPALITY.barangayCount} features, found ${raw.features.length}`);

  let updated = 0;
  let inserted = 0;
  await sql.begin(async (tx) => {
    await tx`CREATE TABLE IF NOT EXISTS barangays (id serial PRIMARY KEY, name text NOT NULL, geom geometry(MultiPolygon,4326) NOT NULL)`;
    await tx`CREATE INDEX IF NOT EXISTS barangays_geom_idx ON barangays USING GIST (geom)`;
    for (const f of raw.features) {
      if (!f.properties.name) throw new Error("Barangay name missing");
      const geomWkt = wkt(f.geometry);
      // Update-by-name instead of TRUNCATE + reinsert: tickets.barangay_id has
      // a real FK to barangays(id), and TRUNCATE ... CASCADE would wipe every
      // ticket/report in the database along with the barangay re-seed.
      const result = await tx`UPDATE barangays SET geom = ST_GeomFromText(${geomWkt}, 4326) WHERE name = ${f.properties.name}`;
      if (result.count > 0) {
        updated++;
      } else {
        await tx`INSERT INTO barangays(name, geom) VALUES(${f.properties.name}, ST_GeomFromText(${geomWkt}, 4326))`;
        inserted++;
      }
    }
  });
  console.log(`Updated ${updated} barangays, inserted ${inserted} new.`);
  await sql.end();
}
main().catch(async e=>{console.error(e instanceof Error?e.message:e);await sql.end();process.exit(1)});