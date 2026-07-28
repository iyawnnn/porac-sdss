# Migration log: GADM → PSGC barangay boundaries

Archived record of `porac-sdss-nextjs/scripts/swap-barangays-to-psgc.ts`, the
one-time script that promoted the PSGC/OCHA-sourced `barangays_v2` table to
be the live `barangays` table, deleted after cleanup since it was already
executed against the production DB and is not meant to run again. See
`PLAN.md` §4.1 for the full narrative (why GADM was replaced, the
empirical validation against real landmarks, etc.) — this file preserves
only the executed script text for reference.

The old GADM-sourced table remains in the DB as `barangays_gadm_old`,
kept intentionally for rollback/reference.

```ts
import { sql } from "../lib/db/raw";

// Promotes barangays_v2 (PSGC/OCHA, ~130 avg vertices/barangay) to be the
// live `barangays` table, keeping the old GADM-sourced table around as
// barangays_gadm_old for reference/rollback rather than dropping it.
// Every existing ticket's barangay_id is recomputed from its actual geom
// against the new polygons — not copied from the old row by ID, since the
// two tables' serial IDs have no relationship to each other.
async function main() {
  await sql.begin(async (tx) => {
    // The FK was created against the OID that's about to become
    // barangays_gadm_old. Postgres doesn't retarget it on rename, so it
    // has to be dropped and rebuilt against the new table explicitly.
    await tx`ALTER TABLE tickets DROP CONSTRAINT tickets_barangay_id_fkey`;

    await tx`ALTER TABLE barangays RENAME TO barangays_gadm_old`;
    await tx`ALTER TABLE barangays_v2 RENAME TO barangays`;

    const tickets = await tx<{ id: number; lng: number; lat: number }[]>`
      SELECT id, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM tickets
    `;

    let strictMatches = 0;
    let fallbackMatches = 0;
    let unresolved = 0;

    for (const t of tickets) {
      const point = tx`ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326)`;

      const [exact] = await tx<{ id: number; name: string }[]>`
        SELECT id, name FROM barangays WHERE ST_Contains(geom, ${point}) LIMIT 1
      `;

      let newBarangayId: number;
      let newBarangayName: string;

      if (exact) {
        newBarangayId = exact.id;
        newBarangayName = exact.name;
        strictMatches++;
      } else {
        const [inCity] = await tx<{ in_city: boolean }[]>`
          SELECT ST_Contains(geom, ${point}) AS in_city FROM city_boundary_osm LIMIT 1
        `;
        if (!inCity?.in_city) {
          unresolved++;
          console.log(`  ticket #${t.id}: UNRESOLVED — outside city_boundary_osm entirely`);
          continue;
        }
        const [nearest] = await tx<{ id: number; name: string; dist_m: number }[]>`
          SELECT id, name, ST_Distance(geom::geography, ${point}::geography) AS dist_m
          FROM barangays ORDER BY geom <-> ${point} LIMIT 1
        `;
        newBarangayId = nearest.id;
        newBarangayName = nearest.name;
        fallbackMatches++;
        console.log(
          `  ticket #${t.id}: resolved via fallback -> ${nearest.name} (${nearest.dist_m.toFixed(0)}m)`
        );
      }

      await tx`UPDATE tickets SET barangay_id = ${newBarangayId} WHERE id = ${t.id}`;
      console.log(`  ticket #${t.id}: barangay_id -> ${newBarangayId} (${newBarangayName})`);
    }

    await tx`
      ALTER TABLE tickets ADD CONSTRAINT tickets_barangay_id_fkey
      FOREIGN KEY (barangay_id) REFERENCES barangays(id)
    `;

    console.log();
    console.log(`Strict matches:   ${strictMatches}`);
    console.log(`Fallback matches: ${fallbackMatches}`);
    console.log(`Unresolved:       ${unresolved}`);
    console.log(`Total tickets:    ${tickets.length}`);

    if (unresolved > 0) {
      throw new Error(`${unresolved} ticket(s) could not be resolved to any barangay — aborting swap.`);
    }
  });

  console.log();
  console.log("Swap complete: barangays_gadm_old (GADM, kept for reference), barangays (PSGC, live).");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
