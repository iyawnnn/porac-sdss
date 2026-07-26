import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db/raw";
import { reportSchema } from "@/lib/validation/report";
import { findBarangayForPoint } from "@/lib/geo/barangay";
import { findNearestElevation } from "@/lib/geo/elevation";
import { officeForCategory } from "@/lib/office";
import { uploadImage } from "@/lib/cloudinary";
import { radiusForCategory } from "@/lib/triage/radius";
import { computeUrgency } from "@/lib/triage/urgency";
import { getElevationBounds } from "@/lib/config";
import { getCurrentRain1hMm } from "@/lib/weather/openweather";

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
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
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
  const radius = radiusForCategory(category);
  const { elevMin, elevMax } = await getElevationBounds();
  const rain1hMm = await getCurrentRain1hMm();

  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const imageUrl = await uploadImage(imageBuffer);

  // tickets.geom / reports.geom / reports.pin_geom are NOT NULL, so these
  // queries go through raw SQL (see lib/db/raw.ts) instead of Drizzle.
  const result = await sql.begin(async (tx) => {
    // Serialize concurrent submissions for the same (category, barangay)
    // so two reports racing within the same radius+window can't both miss
    // each other and create duplicate tickets. Coarser than the actual
    // dedup radius (locks the whole barangay, not just points within the
    // radius), but that's fine at citizen-reporting volumes. Released
    // automatically at transaction end.
    // (Plain SELECT FOR UPDATE was tried first and dropped: combined with
    // the <-> KNN ordering + LIMIT below it hits a Postgres planner
    // limitation — "attempted to lock invisible tuple".)
    await tx`SELECT pg_advisory_xact_lock(hashtext(${category}), ${barangay.id})`;

    // PLAN.md §6: same category, active ticket, created in the last 7
    // days, within the category's tiered radius.
    const [existing] = await tx<{ id: number; member_count: number }[]>`
      SELECT id, member_count
      FROM tickets
      WHERE category = ${category}
        AND status IN ('Reported', 'Under Review', 'In Progress')
        AND created_at > now() - interval '7 days'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      LIMIT 1
    `;

    if (existing) {
      const [report] = await tx<{ id: number }[]>`
        INSERT INTO reports (
          ticket_id, title, description, citizen_severity, elevation_m, image_url, geom, pin_geom
        )
        VALUES (
          ${existing.id}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        )
        RETURNING id
      `;

      const memberCount = existing.member_count + 1;

      const [centroid] = await tx<{ lng: number; lat: number }[]>`
        SELECT ST_X(c) AS lng, ST_Y(c) AS lat
        FROM (
          SELECT ST_Centroid(ST_Collect(geom)) AS c FROM reports WHERE ticket_id = ${existing.id}
        ) t
      `;

      const ticketElevationM = await findNearestElevation(centroid.lat, centroid.lng);
      const urgency = computeUrgency({
        elevationM: ticketElevationM,
        elevMin,
        elevMax,
        memberCount,
        rain1hMm,
      });

      await tx`
        UPDATE tickets SET
          member_count = ${memberCount},
          geom = ST_SetSRID(ST_MakePoint(${centroid.lng}, ${centroid.lat}), 4326),
          elevation_m = ${ticketElevationM},
          elevation_factor = ${urgency.elevationFactor},
          precipitation_factor = ${urgency.precipitationFactor},
          cluster_factor = ${urgency.clusterFactor},
          urgency_score = ${urgency.urgencyScore},
          urgency_band = ${urgency.urgencyBand},
          updated_at = now()
        WHERE id = ${existing.id}
      `;

      return { ticketId: existing.id, reportId: report.id, merged: true, memberCount };
    }

    const urgency = computeUrgency({ elevationM, elevMin, elevMax, memberCount: 1, rain1hMm });

    const [ticket] = await tx<{ id: number }[]>`
      INSERT INTO tickets (
        category, barangay_id, member_count, elevation_m, assigned_office, geom,
        elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band
      )
      VALUES (
        ${category}, ${barangay.id}, 1, ${elevationM}, ${office},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        ${urgency.elevationFactor}, ${urgency.precipitationFactor}, ${urgency.clusterFactor},
        ${urgency.urgencyScore}, ${urgency.urgencyBand}
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

    return { ticketId: ticket.id, reportId: report.id, merged: false, memberCount: 1 };
  });

  return NextResponse.json(
    {
      reportId: result.reportId,
      ticketId: result.ticketId,
      merged: result.merged,
      memberCount: result.memberCount,
      barangay: barangay.name,
      elevationM,
      assignedOffice: office,
    },
    { status: 201 }
  );
}
