import { readFileSync } from "fs";
import { resolve } from "path";
import { sql } from "../db";
import { generateExifImage } from "../../../lib/utils/generate-exif-image";
import { extractExif } from "../lib/exif";
import { recomputeActiveTicketUrgency } from "../lib/recompute";

type Severity = "Low" | "Medium" | "High" | "Critical";

type Spec = {
  barangay: string;
  category: string;
  status: "Reported" | "Under Review" | "In Progress";
  members: number;
  severity: Severity;
  ageHours: number;
  offset: number;
  flag?: string;
};

const specs: Spec[] = [
  { barangay: "Poblacion", category: "Clogged Drain", status: "Reported", members: 3, severity: "Critical", ageHours: 144, offset: 0 },
  { barangay: "Poblacion", category: "Flooding", status: "In Progress", members: 2, severity: "High", ageHours: 112, offset: 0.0001 },
  { barangay: "Poblacion", category: "Pothole", status: "Under Review", members: 4, severity: "Critical", ageHours: 84, offset: -0.0001 },
  { barangay: "Poblacion", category: "Leaking Pipe", status: "Reported", members: 1, severity: "Medium", ageHours: 36, offset: 0.00016 },
  { barangay: "Poblacion", category: "Illegal Dumping", status: "Reported", members: 2, severity: "High", ageHours: 8, offset: -0.00016 },
  { barangay: "Calzadang Bayu", category: "Streetlight Out", status: "Reported", members: 1, severity: "Low", ageHours: 1, offset: 0 },
  { barangay: "Villa Maria", category: "Soil Erosion", status: "In Progress", members: 2, severity: "High", ageHours: 120, offset: 0 },
  { barangay: "Sapang Uwak", category: "Fallen Tree", status: "Reported", members: 1, severity: "Medium", ageHours: 48, offset: 0, flag: "LOCATION_MISMATCH" },
  { barangay: "Camias", category: "Uneven Sidewalk", status: "Under Review", members: 1, severity: "Low", ageHours: 18, offset: 0 },
  { barangay: "Inararo", category: "Overgrown Vegetation", status: "Reported", members: 1, severity: "Medium", ageHours: 72, offset: 0, flag: "SPAM_REVIEW" },
];

const citizens = ["citizen1@porac.ph", "citizen2@porac.ph", "citizen3@porac.ph", "citizen4@porac.ph", "citizen5@porac.ph"];

async function main() {
  await sql`TRUNCATE reports, tickets RESTART IDENTITY CASCADE`;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const [barangay] = await sql<{ id: number; lat: number; lng: number }[]>`
      SELECT id, ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng
      FROM barangays WHERE name = ${spec.barangay}
    `;
    if (!barangay) throw new Error(`Missing ${spec.barangay}`);

    const ticketLat = barangay.lat + spec.offset;
    const ticketLng = barangay.lng + spec.offset;
    const [elevation] = await sql<{ elevation_m: number }[]>`
      SELECT elevation_m FROM dem_points
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${ticketLng}, ${ticketLat}), 4326)
      LIMIT 1
    `;
    const [ticket] = await sql<{ id: number }[]>`
      INSERT INTO tickets (
        category, barangay_id, status, member_count, elevation_m, assigned_office, geom, flagged, created_at, updated_at
      ) VALUES (
        ${spec.category}, ${barangay.id}, ${spec.status}::ticket_status, ${spec.members}, ${elevation.elevation_m}, 'MEO',
        ST_SetSRID(ST_MakePoint(${ticketLng}, ${ticketLat}), 4326), ${Boolean(spec.flag)},
        now() - ${spec.ageHours} * interval '1 hour', now() - ${spec.ageHours} * interval '1 hour'
      )
      RETURNING id
    `;

    for (let member = 0; member < spec.members; member++) {
      const lat = ticketLat + member * 0.000025;
      const lng = ticketLng + member * 0.000025;
      const email = citizens[(i + member) % citizens.length];
      const file = resolve(__dirname, "..", "..", "..", "public", "uploads", "reports", `diverse_${i + 1}_${member + 1}.jpg`);
      const imageUrl = `/uploads/reports/diverse_${i + 1}_${member + 1}.jpg`;
      await generateExifImage({ outputPath: file, lat, lng });
      const exif = await extractExif(readFileSync(file));
      const [citizen] = await sql<{ id: number }[]>`SELECT id FROM citizens WHERE email = ${email}`;

      await sql`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
          geom, pin_geom, exif_geom, exif_captured_at, exif_data, flags, created_at
        ) VALUES (
          ${ticket.id}, ${citizen.id}, ${`${spec.category} in ${spec.barangay}`}, 'Diverse demo report',
          ${spec.severity}, ${elevation.elevation_m}, ${imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${exif.capturedAt!.toISOString()},
          ${JSON.stringify(exif.data)}::jsonb, ${spec.flag ? [spec.flag] : []},
          now() - ${spec.ageHours} * interval '1 hour'
        )
      `;
    }
  }

  const result = await recomputeActiveTicketUrgency(0);
  const priorities = await sql<{ barangay: string; priority_index: number }[]>`
    SELECT b.name AS barangay, t.priority_index
    FROM tickets t JOIN barangays b ON b.id = t.barangay_id
    ORDER BY t.priority_index DESC NULLS LAST
  `;
  console.log(JSON.stringify({ seeded: specs.length, recomputed: result.updated, priorities }));
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});