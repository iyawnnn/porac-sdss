import { join } from "path";
import { fromFile } from "geotiff";
import { sql } from "../lib/db/raw";
import { MUNICIPALITY } from "../lib/municipality-config";

const BATCH_SIZE = 10000;

async function main() {
  const tiffPath = join(__dirname, "..", "..", MUNICIPALITY.demTiffFile);
  const tiff = await fromFile(tiffPath);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const [minX, , , maxY] = image.getBoundingBox();
  const [xRes, yRes] = image.getResolution();
  const nodata = image.getGDALNoData();

  const rasters = await image.readRasters();
  const band = rasters[0] as unknown as ArrayLike<number>;

  await sql`
    CREATE TABLE IF NOT EXISTS dem_points (
      id serial PRIMARY KEY,
      elevation_m real NOT NULL,
      geom geometry(Point, 4326) NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS dem_points_geom_idx ON dem_points USING GIST (geom)`;
  await sql`TRUNCATE dem_points RESTART IDENTITY`;

  let elevs: number[] = [];
  let lons: number[] = [];
  let lats: number[] = [];
  let inserted = 0;

  async function flush() {
    if (elevs.length === 0) return;
    await sql`
      INSERT INTO dem_points (elevation_m, geom)
      SELECT e, ST_SetSRID(ST_MakePoint(lon, lat), 4326)
      FROM unnest(${elevs}::real[], ${lons}::float8[], ${lats}::float8[]) AS t(e, lon, lat)
    `;
    inserted += elevs.length;
    elevs = [];
    lons = [];
    lats = [];
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = band[row * width + col];
      if (nodata !== null && value === nodata) continue;
      elevs.push(value);
      lons.push(minX + (col + 0.5) * xRes);
      lats.push(maxY + (row + 0.5) * yRes);
      if (elevs.length >= BATCH_SIZE) await flush();
    }
  }
  await flush();

  const [{ min, max }] = await sql`
    SELECT min(elevation_m)::float AS min, max(elevation_m)::float AS max FROM dem_points
  `;

  console.log(`Inserted ${inserted} dem_points.`);
  console.log(`elev_min: ${min}, elev_max: ${max}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
