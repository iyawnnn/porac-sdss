import { sql } from "../lib/db/raw";

// GADM name -> PSGC name, so a spelling/punctuation difference (e.g.
// "SantoDomingo" vs "Sto. Domingo") isn't misreported as a real
// reassignment. Built by hand from the two name lists — not derived from
// geometry, purely a label mapping for this comparison.
const GADM_TO_PSGC_NAME: Record<string, string> = {
  AgapitodelRosario: "Agapito del Rosario",
  Amsic: "Amsic",
  Anunas: "Anunas",
  Balibago: "Balibago",
  Capaya: "Capaya",
  "ClaroM.Recto": "Claro M. Recto",
  Cuayan: "Cuayan",
  Cutcut: "Cutcut",
  Cutud: "Cutud",
  LourdesNorthWest: "Lourdes North West",
  LourdesSur: "Lourdes Sur",
  LourdesSurEast: "Lourdes Sur East",
  Malabanias: "Malabañas",
  Margot: "Margot",
  Mining: "Mining",
  NinoyAquino: "Ninoy Aquino",
  Pampang: "Pampang",
  Pandan: "Pandan",
  PulungCacutud: "Pulung Cacutud",
  PulungMaragul: "Pulung Maragul",
  Pulungbulu: "Pulungbulu",
  Salapungan: "Salapungan",
  SanJose: "San Jose",
  SanNicolas: "San Nicolas",
  SantaTeresita: "Sta. Teresita",
  SantaTrinidad: "Sta. Trinidad",
  SantoCristo: "Sto. Cristo",
  SantoDomingo: "Sto. Domingo",
  SantoRosario: "Sto. Rosario",
  Sapalibutad: "Sapalibutad",
  Sapangbato: "Sapangbato",
  Tabun: "Tabun",
  VirgenDelosRemedios: "Virgen Delos Remedios",
};

async function main() {
  const tickets = await sql<
    { id: number; old_barangay_id: number; old_name: string; lng: number; lat: number }[]
  >`
    SELECT t.id, t.barangay_id AS old_barangay_id, b.name AS old_name,
           ST_X(t.geom) AS lng, ST_Y(t.geom) AS lat
    FROM tickets t
    JOIN barangays b ON b.id = t.barangay_id
    ORDER BY t.id
  `;

  console.log(`Comparing ${tickets.length} existing ticket(s) against barangays_v2 (PSGC)...\n`);

  let same = 0;
  let changed = 0;
  let unmatched = 0;

  for (const t of tickets) {
    const point = sql`ST_SetSRID(ST_MakePoint(${t.lng}, ${t.lat}), 4326)`;
    const [exact] = await sql<{ name: string }[]>`
      SELECT name FROM barangays_v2 WHERE ST_Contains(geom, ${point}) LIMIT 1
    `;
    const expectedNewName = GADM_TO_PSGC_NAME[t.old_name] ?? t.old_name;

    if (!exact) {
      const [nearest] = await sql<{ name: string; dist_m: number }[]>`
        SELECT name, ST_Distance(geom::geography, ${point}::geography) AS dist_m
        FROM barangays_v2 ORDER BY geom <-> ${point} LIMIT 1
      `;
      unmatched++;
      console.log(
        `  ticket #${t.id}: OLD="${t.old_name}" -> NEW=no strict match (nearest: ${nearest.name}, ${nearest.dist_m.toFixed(0)}m)`
      );
      continue;
    }

    if (exact.name === expectedNewName) {
      same++;
    } else {
      changed++;
      console.log(`  ticket #${t.id}: OLD="${t.old_name}" -> NEW="${exact.name}" (CHANGED)`);
    }
  }

  console.log();
  console.log(`Same barangay:    ${same}`);
  console.log(`Changed barangay: ${changed}`);
  console.log(`No strict match:  ${unmatched}`);
  console.log(`Total:            ${tickets.length}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
