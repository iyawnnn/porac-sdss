import { sql } from "../db";

// Confirms city_boundary_osm is populated and geometrically sane after
// running import:city-boundary — the specific failure mode this catches is
// the one that motivated writing that script: an empty table that silently
// makes BarangayService.findBarangayForPoint()'s fallback always reject.
async function main() {
  const rows = await sql<
    { count: string; valid_count: string; area_deg2: number | null; source: string | null }[]
  >`
    SELECT
      count(*)::text AS count,
      count(*) FILTER (WHERE ST_IsValid(geom))::text AS valid_count,
      sum(ST_Area(geom)) AS area_deg2,
      max(source) AS source
    FROM city_boundary_osm
  `;
  const row = rows[0];
  console.log(`city_boundary_osm rows: ${row.count} (valid geometry: ${row.valid_count})`);
  console.log(`source: ${row.source ?? "(none)"}`);
  console.log(`total area: ${row.area_deg2?.toFixed(6) ?? "n/a"} deg^2`);

  if (row.count === "0") {
    console.warn(
      "\n[verify-city-boundary] Table is empty. BarangayService.findBarangayForPoint()'s " +
        "outer-envelope fallback will reject every point that misses every barangay polygon. " +
        "Run `pnpm --prefix api import:city-boundary` to populate it. See docs/database.md.",
    );
  } else if (row.count !== row.valid_count) {
    console.warn("\n[verify-city-boundary] One or more stored geometries are invalid (ST_IsValid = false).");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
