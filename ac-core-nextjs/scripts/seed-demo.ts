import bcrypt from "bcryptjs";
import { sql } from "../lib/db/raw";
import { computeUrgency } from "../lib/triage/urgency";
import { officeForCategory } from "../lib/office";
import { findNearestElevation } from "../lib/geo/elevation";
import { getElevationBounds } from "../lib/config";

// Marker for idempotency: every demo citizen's email ends in this domain,
// so a rerun can find and clear exactly the rows this script created
// (and nothing else) before reseeding.
const DEMO_EMAIL_DOMAIN = "@ac-core-demo.local";
const DEMO_PASSWORD = "demo1234";

const DEMO_CITIZENS = [
  { email: `maria.santos${DEMO_EMAIL_DOMAIN}`, firstName: "Maria", lastName: "Santos" },
  { email: `juan.delacruz${DEMO_EMAIL_DOMAIN}`, firstName: "Juan", lastName: "Dela Cruz" },
  { email: `rosa.reyes${DEMO_EMAIL_DOMAIN}`, firstName: "Rosa", lastName: "Reyes" },
  { email: `pedro.garcia${DEMO_EMAIL_DOMAIN}`, firstName: "Pedro", lastName: "Garcia" },
];

// recomputeActiveTicketUrgency() (triggered on every admin dashboard/map
// load) applies ONE city-wide rain reading to every active ticket — there
// is no per-ticket rain in the real system. So a per-ticket rain value
// here would just get silently overwritten the moment an admin opens the
// dashboard. Instead this seeds a single "it's raining right now" value
// into the same config-table cache the live recompute reads from (see
// main()), so the demo storm survives page loads the same way a real one
// would, and expires on its own via that cache's normal ~10min TTL.
const DEMO_RAIN_1H_MM = 15;

interface TicketSpec {
  barangayName: string;
  category: string;
  title: string;
  description: string;
  citizenSeverity: string;
  memberCount: number; // >1 => merged ticket, member reports offset from center; also the main lever for hitting a target urgency band under a fixed city-wide rain reading
  fraudFlag?: "LOCATION_MISMATCH";
  // Overrides ST_PointOnSurface(barangay.geom) as the seed location. Needed
  // for barangays whose real polygon is large/irregular enough that
  // ST_PointOnSurface can land somewhere remote but still technically
  // inside the shape (confirmed for Balibago: a single valid polygon, but
  // one spanning from the well-known nightlife district up to ~15.22°N,
  // well past the OSM city boundary's own northern edge). Use verified
  // real landmark coordinates instead where this matters.
  coords?: { lat: number; lng: number };
}

const TICKETS: TicketSpec[] = [
  {
    barangayName: "Amsic",
    category: "Pothole",
    title: "Deep pothole along the main road",
    description: "Vehicles swerving to avoid it, near-misses especially at night.",
    citizenSeverity: "Medium",
    memberCount: 1,
  },
  {
    barangayName: "Cutcut",
    category: "Flooding",
    title: "Knee-deep flooding after heavy rain",
    description: "Water enters ground-floor homes within an hour of rain starting.",
    citizenSeverity: "Critical",
    memberCount: 3,
  },
  {
    barangayName: "Balibago",
    coords: { lat: 15.1671526, lng: 120.5866112 }, // Fields Bistro, Walking St. — verified real landmark, see coords note on TicketSpec
    category: "Clogged Drain",
    title: "Drainage clogged with garbage",
    description: "Standing water for days after any rain.",
    citizenSeverity: "Medium",
    memberCount: 2,
  },
  {
    barangayName: "Pampang",
    category: "Streetlight Out",
    title: "Streetlight out for two weeks",
    description: "Dark intersection, safety concern at night.",
    citizenSeverity: "Low",
    memberCount: 1,
  },
  {
    barangayName: "Malabañas",
    category: "Leaking Pipe",
    title: "Water main leaking onto the road",
    description: "Constant puddle even without rain, wasting water.",
    citizenSeverity: "Medium",
    memberCount: 2,
  },
  {
    // High elevation here (Pinatubo foothills) keeps this Medium even
    // fully clustered — a good demo point that the formula is genuinely
    // terrain-aware, not just reacting to report volume.
    barangayName: "Sapangbato",
    category: "Flooding",
    title: "Flash flooding near the creek",
    description: "Fast-rising water from foothill runoff.",
    citizenSeverity: "Critical",
    memberCount: 4,
  },
  {
    barangayName: "Anunas",
    category: "Uncollected Garbage",
    title: "Garbage not collected for a week",
    description: "Piling up near the market, smell attracting pests.",
    citizenSeverity: "Low",
    memberCount: 1,
  },
  {
    // Lowest elevation among the picked barangays — reliably clears
    // Critical once clustered, unlike Sapangbato above.
    barangayName: "Pulungbulu",
    category: "Fallen Tree",
    title: "Fallen tree blocking part of the road, multiple reports",
    description: "Branch came down after last night's wind, blocking a low-lying stretch that already floods easily.",
    citizenSeverity: "High",
    memberCount: 10,
  },
  {
    // Also low elevation, and the report carrying the fraud flag — shows
    // a flag doesn't suppress urgency or block the ticket.
    barangayName: "Cutud",
    category: "Pothole",
    title: "Cluster of potholes near the school",
    description: "Several potholes within a block, students walk around them.",
    citizenSeverity: "High",
    memberCount: 10,
    fraudFlag: "LOCATION_MISMATCH",
  },
  {
    barangayName: "Balibago",
    coords: { lat: 15.1671526, lng: 120.5866112 }, // Fields Bistro, Walking St. — same verified point as the other Balibago entry
    category: "Pothole",
    title: "Widening pothole reported repeatedly",
    description: "Multiple neighbors have flagged the same defect.",
    citizenSeverity: "High",
    memberCount: 10,
  },
];

function jitterMeters(lat: number, lng: number, maxMeters: number, seed: number) {
  const angle = (seed * 137.5) % 360;
  const distance = seed % 3 === 0 ? maxMeters * 0.3 : maxMeters * 0.7;
  const dLat = (distance * Math.cos((angle * Math.PI) / 180)) / 111320;
  const dLng = (distance * Math.sin((angle * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function fakePhash(n: number): string {
  return (n * 999999937).toString(16).padStart(16, "0").slice(-16);
}

async function clearDemoData() {
  const demoCitizens = await sql<{ id: number }[]>`
    SELECT id FROM citizens WHERE email LIKE ${"%" + DEMO_EMAIL_DOMAIN}
  `;
  if (demoCitizens.length === 0) return;
  const citizenIds = demoCitizens.map((c) => c.id);

  const demoTickets = await sql<{ ticket_id: number }[]>`
    SELECT DISTINCT ticket_id FROM reports WHERE citizen_id = ANY(${citizenIds}::int[])
  `;
  const ticketIds = demoTickets.map((t) => t.ticket_id);

  if (ticketIds.length > 0) {
    await sql`DELETE FROM status_history WHERE ticket_id = ANY(${ticketIds}::int[])`;
    await sql`DELETE FROM office_reassignments WHERE ticket_id = ANY(${ticketIds}::int[])`;
    await sql`DELETE FROM verifications WHERE ticket_id = ANY(${ticketIds}::int[])`;
    await sql`DELETE FROM reports WHERE ticket_id = ANY(${ticketIds}::int[])`;
    await sql`DELETE FROM tickets WHERE id = ANY(${ticketIds}::int[])`;
  }
  await sql`DELETE FROM rate_limit_events WHERE citizen_id = ANY(${citizenIds}::int[])`;
  await sql`DELETE FROM citizens WHERE id = ANY(${citizenIds}::int[])`;

  console.log(
    `Cleared ${ticketIds.length} previous demo ticket(s) and ${citizenIds.length} demo citizen(s).`
  );
}

async function seedCitizens(): Promise<number[]> {
  const ids: number[] = [];
  for (const c of DEMO_CITIZENS) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO citizens (email, password_hash, first_name, last_name)
      VALUES (${c.email}, ${passwordHash}, ${c.firstName}, ${c.lastName})
      RETURNING id
    `;
    ids.push(row.id);
  }
  return ids;
}

async function seedTicket(
  spec: TicketSpec,
  citizenIds: number[],
  cursor: { i: number },
  elevMin: number,
  elevMax: number
) {
  const [barangayRow] = await sql<{ id: number; lat: number; lng: number }[]>`
    SELECT id, ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng
    FROM barangays WHERE name = ${spec.barangayName}
  `;
  if (!barangayRow) throw new Error(`Barangay not found: ${spec.barangayName}`);

  const barangay = {
    id: barangayRow.id,
    lat: spec.coords?.lat ?? barangayRow.lat,
    lng: spec.coords?.lng ?? barangayRow.lng,
  };

  // Belt-and-suspenders: a GADM-era version of this exact check (an
  // ST_PointOnSurface sample landing outside the real city boundary) is
  // what caused three demo tickets to need deleting after the PSGC
  // migration, and it's *also* what caught Balibago's polygon being large
  // enough that ST_PointOnSurface picked a remote point outside the OSM
  // boundary even though PSGC's shape itself is valid (see the `coords`
  // override used for Balibago above). So this still applies even with an
  // explicit override — fail loudly rather than silently seed a bad point.
  const [inCity] = await sql<{ in_city: boolean }[]>`
    SELECT ST_Contains(geom, ST_SetSRID(ST_MakePoint(${barangay.lng}, ${barangay.lat}), 4326)) AS in_city
    FROM city_boundary_osm
  `;
  if (!inCity?.in_city) {
    throw new Error(
      `${spec.barangayName}'s seed point (${barangay.lat}, ${barangay.lng}) falls outside city_boundary_osm — refusing to seed an invalid point.`
    );
  }

  const elevationM = await findNearestElevation(barangay.lat, barangay.lng);
  const office = officeForCategory(spec.category);
  const urgency = computeUrgency({
    elevationM,
    elevMin,
    elevMax,
    memberCount: spec.memberCount,
    rain1hMm: DEMO_RAIN_1H_MM,
  });

  const [ticket] = await sql<{ id: number }[]>`
    INSERT INTO tickets (
      category, barangay_id, member_count, elevation_m, assigned_office, geom,
      elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band
    ) VALUES (
      ${spec.category}, ${barangay.id}, ${spec.memberCount}, ${elevationM}, ${office},
      ST_SetSRID(ST_MakePoint(${barangay.lng}, ${barangay.lat}), 4326),
      ${urgency.elevationFactor}, ${urgency.precipitationFactor}, ${urgency.clusterFactor},
      ${urgency.urgencyScore}, ${urgency.urgencyBand}
    ) RETURNING id
  `;

  for (let i = 0; i < spec.memberCount; i++) {
    const pos =
      i === 0 ? { lat: barangay.lat, lng: barangay.lng } : jitterMeters(barangay.lat, barangay.lng, 15, i);
    const citizenId = citizenIds[cursor.i % citizenIds.length];
    cursor.i++;

    const isFraudReport = !!spec.fraudFlag && i === spec.memberCount - 1;
    const flags = isFraudReport ? [spec.fraudFlag as string] : [];
    const locationMismatchM = isFraudReport ? 350 : null;
    const exifPos = isFraudReport ? jitterMeters(pos.lat, pos.lng, 350, 99) : null;
    const exifGeomFragment = exifPos
      ? sql`ST_SetSRID(ST_MakePoint(${exifPos.lng}, ${exifPos.lat}), 4326)`
      : sql`NULL`;

    await sql`
      INSERT INTO reports (
        ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
        geom, pin_geom, exif_geom, image_phash, location_mismatch_m, flags
      ) VALUES (
        ${ticket.id}, ${citizenId}, ${spec.title}, ${spec.description}, ${spec.citizenSeverity},
        ${elevationM}, ${`https://picsum.photos/seed/ac-core-${ticket.id}-${i}/640/480`},
        ST_SetSRID(ST_MakePoint(${pos.lng}, ${pos.lat}), 4326),
        ST_SetSRID(ST_MakePoint(${pos.lng}, ${pos.lat}), 4326),
        ${exifGeomFragment},
        ${fakePhash(ticket.id * 100 + i)}, ${locationMismatchM}, ${flags}
      )
    `;
  }

  const flagNote = spec.fraudFlag ? ", 1 flagged report" : "";
  console.log(
    `  Ticket #${ticket.id}: ${spec.category} @ ${spec.barangayName} — ${urgency.urgencyBand} (${urgency.urgencyScore.toFixed(3)}), members=${spec.memberCount}${flagNote}`
  );
}

async function main() {
  await clearDemoData();

  const citizenIds = await seedCitizens();
  const { elevMin, elevMax } = await getElevationBounds();
  const cursor = { i: 0 };

  console.log("Seeding demo tickets:");
  for (const spec of TICKETS) {
    await seedTicket(spec, citizenIds, cursor, elevMin, elevMax);
  }

  // Seed the same config-table cache lib/weather/openweather.ts reads, so
  // the next recompute-on-load (triggered by opening /admin/tickets or
  // /admin/map) uses this value instead of the real live API — otherwise
  // the very first admin page load would immediately overwrite every
  // precipitation_factor above with whatever it's actually doing outside
  // right now. Expires on its own via that cache's normal ~10min TTL.
  await sql`
    INSERT INTO config (key, value, note)
    VALUES (
      'rain_1h_mm', ${String(DEMO_RAIN_1H_MM)},
      'Seeded by scripts/seed-demo.ts to keep demo urgency scores stable through the next recompute. Expires via the normal ~10min cache TTL — rerun the demo seed if it has gone stale.'
    )
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value, computed_at = now(), note = EXCLUDED.note
  `;

  console.log(`Demo data seeded: ${TICKETS.length} tickets, ${citizenIds.length} citizens.`);
  console.log(`Demo login: any of the emails above, password "${DEMO_PASSWORD}".`);
  console.log(
    `Seeded rain_1h_mm=${DEMO_RAIN_1H_MM}mm/h into the live-weather cache (expires in ~10 min).`
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
