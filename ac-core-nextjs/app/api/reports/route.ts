import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/raw";
import { reportSchema } from "@/lib/validation/report";
import { findBarangayForPoint } from "@/lib/geo/barangay";
import { findNearestElevation } from "@/lib/geo/elevation";
import { officeForCategory } from "@/lib/office";
import { uploadImage } from "@/lib/cloudinary";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const parsed = reportSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    category: formData.get("category"),
    citizenSeverity: formData.get("citizen_severity"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { title, description, category, citizenSeverity, lat, lng } = parsed.data;

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  // Exact polygon containment, not nearest-centroid — a point outside all
  // 33 barangays is rejected outright (PLAN.md §4.1/§12).
  const barangay = await findBarangayForPoint(lat, lng);
  if (!barangay) {
    return NextResponse.json(
      {
        error:
          "This location falls outside Angeles City's 33 barangays. Reports can only be filed within city limits.",
      },
      { status: 400 }
    );
  }

  const elevationM = await findNearestElevation(lat, lng);
  const office = officeForCategory(category);

  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const imageUrl = await uploadImage(imageBuffer);

  // tickets.geom / reports.geom / reports.pin_geom are NOT NULL, so these
  // inserts go through raw SQL (see lib/db/raw.ts) instead of Drizzle.
  const { ticketId, reportId } = await sql.begin(async (tx) => {
    const [ticket] = await tx<{ id: number }[]>`
      INSERT INTO tickets (category, barangay_id, member_count, elevation_m, assigned_office, geom)
      VALUES (
        ${category}, ${barangay.id}, 1, ${elevationM}, ${office},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      )
      RETURNING id
    `;

    const [report] = await tx<{ id: number }[]>`
      INSERT INTO reports (
        ticket_id, title, description, citizen_severity, elevation_m, image_url, geom, pin_geom
      )
      VALUES (
        ${ticket.id}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      )
      RETURNING id
    `;

    return { ticketId: ticket.id, reportId: report.id };
  });

  return NextResponse.json(
    {
      reportId,
      ticketId,
      barangay: barangay.name,
      elevationM,
      assignedOffice: office,
    },
    { status: 201 }
  );
}
