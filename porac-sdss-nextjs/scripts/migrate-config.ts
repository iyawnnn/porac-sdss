import { sql } from "../lib/db/raw";

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS config (key text PRIMARY KEY, value text NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(), note text)`;
  await sql`INSERT INTO config(key,value,computed_at,note) VALUES('rain_1h_mm','0',now(),'Cold-start weather cache fallback') ON CONFLICT(key) DO NOTHING`;
  await sql`INSERT INTO config(key,value,computed_at,note) SELECT 'elev_min',min(elevation_m)::text,now(),'DEM-derived minimum elevation' FROM dem_points ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,computed_at=EXCLUDED.computed_at,note=EXCLUDED.note`;
  await sql`INSERT INTO config(key,value,computed_at,note) SELECT 'elev_max',max(elevation_m)::text,now(),'DEM-derived maximum elevation' FROM dem_points ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,computed_at=EXCLUDED.computed_at,note=EXCLUDED.note`;
  console.log("config table and cache defaults applied.");
  await sql.end();
}
main().catch(async error => { console.error(error); await sql.end(); process.exit(1); });