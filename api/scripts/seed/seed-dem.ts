import { join } from "path";
import { fromFile } from "geotiff";
import { sql } from "../db";
import { MUNICIPALITY } from "../../../lib/municipality-config";

const BATCH_SIZE = 10000;
async function main() {
  const image = await (await fromFile(join(__dirname, "..", "..", "..", MUNICIPALITY.demTiffFile))).getImage();
  const [minX, , , maxY] = image.getBoundingBox(); const [xRes, yRes] = image.getResolution(); const nodata = image.getGDALNoData();
  const band = (await image.readRasters())[0] as unknown as ArrayLike<number>;
  await sql`CREATE TABLE IF NOT EXISTS dem_points (id serial PRIMARY KEY, elevation_m real NOT NULL, geom geometry(Point,4326) NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS dem_points_geom_idx ON dem_points USING GIST (geom)`;
  await sql`TRUNCATE dem_points RESTART IDENTITY`;
  let elevs:number[]=[]; let lons:number[]=[]; let lats:number[]=[]; let inserted=0;
  async function flush(){if(!elevs.length)return;const rows=await sql`INSERT INTO dem_points(elevation_m,geom) SELECT e,point FROM (SELECT e,ST_SetSRID(ST_MakePoint(lon,lat),4326) AS point FROM unnest(${elevs}::real[],${lons}::float8[],${lats}::float8[]) AS t(e,lon,lat)) s WHERE EXISTS (SELECT 1 FROM barangays b WHERE ST_Contains(b.geom,point)) RETURNING id`;inserted+=rows.length;elevs=[];lons=[];lats=[];}
  for(let row=0;row<image.getHeight();row++)for(let col=0;col<image.getWidth();col++){const value=band[row*image.getWidth()+col];if(nodata!==null&&value===nodata)continue;elevs.push(value);lons.push(minX+(col+.5)*xRes);lats.push(maxY+(row+.5)*yRes);if(elevs.length>=BATCH_SIZE)await flush();}
  await flush(); const [range]=await sql`SELECT min(elevation_m)::float AS min,max(elevation_m)::float AS max FROM dem_points`;console.log(`Inserted ${inserted} dem_points.`);console.log(`elev_min: ${range.min}, elev_max: ${range.max}`);await sql.end();
}
main().catch(async e=>{console.error(e instanceof Error?e.message:e);await sql.end();process.exit(1)});