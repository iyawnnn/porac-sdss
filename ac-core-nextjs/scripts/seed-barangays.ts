import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";

type Feature = {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: string; coordinates: unknown };
};

async function main() {
  const geojsonPath = join(__dirname, "..", "..", "angeles.geojson");
  const raw = JSON.parse(readFileSync(geojsonPath, "utf8")) as {
    features: Feature[];
  };

  if (raw.features.length !== 33) {
    console.error(`Expected 33 features, got ${raw.features.length}.`);
    console.error(
      "Property keys on first feature:",
      Object.keys(raw.features[0]?.properties ?? {})
    );
    process.exit(1);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS barangays (
      id serial PRIMARY KEY,
      name text NOT NULL,
      geom geometry(MultiPolygon, 4326) NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS barangays_geom_idx ON barangays USING GIST (geom)
  `;
  await sql`TRUNCATE barangays RESTART IDENTITY`;

  for (const feature of raw.features) {
    const name = feature.properties.NAME_3;
    const geomJson = JSON.stringify(feature.geometry);
    await sql`
      INSERT INTO barangays (name, geom)
      VALUES (${name}, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${geomJson})), 4326))
    `;
  }

  const [{ count }] = await sql`SELECT count(*)::int FROM barangays`;
  const [{ extent }] = await sql`SELECT ST_Extent(geom)::text AS extent FROM barangays`;

  console.log(`Inserted ${count} barangays.`);
  console.log(`Bounding box: ${extent}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
