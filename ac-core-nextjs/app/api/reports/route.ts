import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db/raw";
import { reportSchema } from "@/lib/validation/report";
import { findBarangayForPoint } from "@/lib/geo/barangay";
import { findNearestElevation } from "@/lib/geo/elevation";
import { haversineMeters } from "@/lib/geo/distance";
import { officeForCategory } from "@/lib/office";
import { uploadImage } from "@/lib/cloudinary";
import { radiusForCategory } from "@/lib/triage/radius";
import { computeUrgency } from "@/lib/triage/urgency";
import { getElevationBounds } from "@/lib/config";
import { getCurrentRain1hMm } from "@/lib/weather/openweather";
import { extractExif } from "@/lib/exif";
import { computeDHash, hammingDistanceHex } from "@/lib/phash";
import { checkRateLimit, recordRateLimitEvent } from "@/lib/ratelimit";
import { verifyCitizenSession, CITIZEN_SESSION_COOKIE } from "@/lib/auth/citizenSession";

// Citizen accounts are required — no anonymous/guest reporting (PLAN.md §9
// decision). proxy.ts already gates /api/reports, but the route still
// needs the actual citizenId, and checking again here is cheap defense in
// depth rather than trusting proxy alone.
const LOCATION_MISMATCH_THRESHOLD_M = 100;
const STALE_PHOTO_HOURS = 24;
const DUPLICATE_HAMMING_THRESHOLD = 10; // out of 64 bits; ponytail: tune if false-positive rate matters later

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const citizenToken = req.cookies.get(CITIZEN_SESSION_COOKIE)?.value;
  const citizenSession = citizenToken ? await verifyCitizenSession(citizenToken) : null;
  if (!citizenSession) {
    return NextResponse.json({ error: "Log in to submit a report." }, { status: 401 });
  }

  const ip = getClientIp(req);
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

  // PLAN.md §9: layered limits, checked before any expensive work.
  const rateLimit = await checkRateLimit(citizenSession.citizenId, ip, lat, lng);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
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

  // PLAN.md §8: re-extract EXIF from the buffer server-side — never trust
  // client-supplied EXIF, it's spoofable.
  const exif = await extractExif(imageBuffer);
  const phash = await computeDHash(imageBuffer);

  const flags: string[] = [];
  let locationMismatchM: number | null = null;

  if (exif.lat === null || exif.lng === null) {
    flags.push("NO_EXIF");
  } else {
    locationMismatchM = haversineMeters(lat, lng, exif.lat, exif.lng);
    if (locationMismatchM > LOCATION_MISMATCH_THRESHOLD_M) {
      flags.push("LOCATION_MISMATCH");
    }
  }

  const exifCapturedAtIso = exif.capturedAt ? exif.capturedAt.toISOString() : null;

  if (exif.capturedAt) {
    const ageHours = (Date.now() - exif.capturedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > STALE_PHOTO_HOURS) {
      flags.push("STALE_PHOTO");
    }
  }

  // O(n) scan over the last 30 days of phashes — fine at prototype volume.
  // Move to a bit-column + SQL bit_count, or an ANN index, if this becomes
  // a real bottleneck.
  const recentPhashes = await sql<{ id: number; image_phash: string }[]>`
    SELECT id, image_phash FROM reports
    WHERE image_phash IS NOT NULL AND created_at > now() - interval '30 days'
  `;
  const duplicateMatch = recentPhashes.find(
    (r) => hammingDistanceHex(phash, r.image_phash) <= DUPLICATE_HAMMING_THRESHOLD
  );
  if (duplicateMatch) {
    flags.push(`DUPLICATE_IMAGE:${duplicateMatch.id}`);
  }

  const imageUrl = await uploadImage(imageBuffer);

  const exifGeomFragment =
    exif.lat !== null && exif.lng !== null
      ? sql`ST_SetSRID(ST_MakePoint(${exif.lng}, ${exif.lat}), 4326)`
      : sql`NULL`;

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

    await recordRateLimitEvent(tx, citizenSession.citizenId, ip, lat, lng);

    if (existing) {
      const [report] = await tx<{ id: number }[]>`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
          geom, pin_geom, exif_geom, exif_captured_at, image_phash, location_mismatch_m, flags
        )
        VALUES (
          ${existing.id}, ${citizenSession.citizenId}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${exifGeomFragment},
          ${exifCapturedAtIso}, ${phash}, ${locationMismatchM}, ${flags}
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
        ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
        geom, pin_geom, exif_geom, exif_captured_at, image_phash, location_mismatch_m, flags
      )
      VALUES (
        ${ticket.id}, ${citizenSession.citizenId}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        ${exifGeomFragment},
        ${exifCapturedAtIso}, ${phash}, ${locationMismatchM}, ${flags}
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
      flags,
    },
    { status: 201 }
  );
}
