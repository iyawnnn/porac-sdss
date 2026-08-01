import { sql } from "../db";

// elev_min/elev_max are fixed constants seeded in Phase 0 (config table),
// computed via ST_Contains against the barangay polygons. Never
// recomputed live — see scripts/verify-config.ts.
export async function getElevationBounds() {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM config WHERE key IN ('elev_min', 'elev_max')
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return { elevMin: map.elev_min, elevMax: map.elev_max };
}
