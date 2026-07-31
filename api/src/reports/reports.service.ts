import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { BarangayService } from '../domain/barangay.service';
import { ElevationService } from '../domain/elevation.service';
import { AppConfigService } from '../domain/app-config.service';
import { WeatherService } from '../domain/weather.service';
import { MediaService } from '../domain/media.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { RecomputeService } from '../domain/recompute.service';
import { officeForCategory } from '../domain/office';
import { radiusForCategory } from '../domain/radius';
import { haversineMeters } from '../domain/distance';
import { computeUrgency } from '../domain/urgency';
import type { ReportInput } from '../contracts/schemas';
import type { CitizenSession } from '../auth/session.service';

// PLAN.md §9: layered limits + flag thresholds, ported verbatim from
// app/api/reports/route.ts.
const LOCATION_MISMATCH_THRESHOLD_M = 100;
const STALE_PHOTO_HOURS = 24;
const DUPLICATE_HAMMING_THRESHOLD = 10; // out of 64 bits; ponytail: tune if false-positive rate matters later

export interface SubmitReportResult {
  reportId: number;
  ticketId: number;
  merged: boolean;
  memberCount: number;
  barangay: string;
  elevationM: number;
  assignedOffice: 'MEO' | 'MDRRMO';
  flags: string[];
}

export interface MyReportRow {
  id: number;
  ticket_id: number;
  title: string;
  category: string;
  citizen_severity: string;
  image_url: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  created_at: string;
}

export interface MyReportDetail {
  id: number;
  ticket_id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  category: string;
  status: string;
  urgency_band: string | null;
  barangay_name: string;
  lat: number;
  lng: number;
  citizen_first_name: string;
  citizen_last_name: string;
  created_at: string;
  ticket_created_at: string;
  ticket_updated_at: string;
}

export interface StatusHistoryStep {
  status: string;
  admin_name: string | null;
  changed_at: string;
}

export interface PublicTicketGeoRow {
  id: number;
  category: string;
  status: string;
  barangay_name: string;
  urgency_band: string | null;
  urgency_score: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
  own_report_id: number | null;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly barangay: BarangayService,
    private readonly elevation: ElevationService,
    private readonly appConfig: AppConfigService,
    private readonly weather: WeatherService,
    private readonly media: MediaService,
    private readonly rateLimit: RateLimitService,
    private readonly recompute: RecomputeService,
  ) {}

  async submit(
    citizen: CitizenSession,
    ip: string,
    input: ReportInput,
    imageBuffer: Buffer,
  ): Promise<SubmitReportResult> {
    const sql = this.pg;
    const { title, description, category, citizenSeverity, lat, lng } = input;

    // Step 1: rate limit, before any expensive work.
    const rateLimitResult = await this.rateLimit.checkRateLimit(citizen.citizenId, ip, lat, lng);
    if (!rateLimitResult.allowed) {
      throw new HttpException(rateLimitResult.reason ?? 'Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Step 2: exact polygon containment — reject outright if outside all
    // 33 barangays (PLAN.md §4.1/§12).
    const barangay = await this.barangay.findBarangayForPoint(lat, lng);
    if (!barangay) {
      throw new BadRequestException(
        "This location falls outside Municipality of Porac's 33 barangays. Reports can only be filed within city limits.",
      );
    }

    // Step 3: elevation, office, radius, elevation bounds, rain.
    const elevationM = await this.elevation.findNearestElevation(lat, lng);
    const office = officeForCategory(category);
    const radius = radiusForCategory(category);
    const { elevMin, elevMax } = await this.appConfig.getElevationBounds();
    const rain1hMm = await this.weather.getCurrentRain1hMm();

    // Step 4: server-side EXIF re-extraction + dHash — never trust
    // client-supplied EXIF, it's spoofable.
    const exif = await this.media.extractExif(imageBuffer);
    const phash = await this.media.computeDHash(imageBuffer);

    // Step 5: flag accumulation. Flags never block submission.
    const flags: string[] = [];
    let locationMismatchM: number | null = null;

    if (barangay.viaFallback) {
      flags.push(`BOUNDARY_FALLBACK:${barangay.name}:${Math.round(barangay.fallbackDistanceM ?? 0)}`);
    }

    if (exif.lat === null || exif.lng === null) {
      flags.push('NO_EXIF');
    } else {
      locationMismatchM = haversineMeters(lat, lng, exif.lat, exif.lng);
      if (locationMismatchM > LOCATION_MISMATCH_THRESHOLD_M) {
        flags.push('LOCATION_MISMATCH');
      }
    }

    const exifCapturedAtIso = exif.capturedAt ? exif.capturedAt.toISOString() : null;

    if (exif.capturedAt) {
      const ageHours = (Date.now() - exif.capturedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours > STALE_PHOTO_HOURS) {
        flags.push('STALE_PHOTO');
      }
    }

    // O(n) scan over the last 30 days of phashes — fine at prototype
    // volume. Move to a bit-column + SQL bit_count, or an ANN index, if
    // this becomes a real bottleneck.
    const recentPhashes = await sql<{ id: number; image_phash: string }[]>`
      SELECT id, image_phash FROM reports
      WHERE image_phash IS NOT NULL AND created_at > now() - interval '30 days'
    `;
    const duplicateMatch = recentPhashes.find(
      (r) => this.media.hammingDistanceHex(phash, r.image_phash) <= DUPLICATE_HAMMING_THRESHOLD,
    );
    if (duplicateMatch) {
      flags.push(`DUPLICATE_IMAGE:${duplicateMatch.id}`);
    }

    // Step 6: Cloudinary upload.
    const imageUrl = await this.media.uploadImage(imageBuffer);

    const exifGeomFragment =
      exif.lat !== null && exif.lng !== null
        ? sql`ST_SetSRID(ST_MakePoint(${exif.lng}, ${exif.lat}), 4326)`
        : sql`NULL`;

    // Step 7: tickets.geom / reports.geom / reports.pin_geom are NOT NULL,
    // so this goes through the raw PG client instead of Drizzle.
    const result = await sql.begin(async (tx) => {
      // Serialize concurrent submissions for the same (category, barangay)
      // so two reports racing within the same radius+window can't both
      // miss each other and create duplicate tickets. Coarser than the
      // actual dedup radius (locks the whole barangay, not just points
      // within the radius), but that's fine at citizen-reporting volumes.
      // Released automatically at transaction end.
      // (Plain SELECT FOR UPDATE was tried first and dropped: combined
      // with the <-> KNN ordering + LIMIT below it hits a Postgres planner
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

      await this.rateLimit.recordRateLimitEvent(tx, citizen.citizenId, ip, lat, lng);

      if (existing) {
        const [report] = await tx<{ id: number }[]>`
          INSERT INTO reports (
            ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
            geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
          )
          VALUES (
            ${existing.id}, ${citizen.citizenId}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
            ${exifGeomFragment},
            ${exifCapturedAtIso}, ${JSON.stringify(exif.data)}::jsonb, ${phash}, ${locationMismatchM}, ${flags}
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

        const ticketElevationM = await this.elevation.findNearestElevation(centroid.lat, centroid.lng);
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
          geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
        )
        VALUES (
          ${ticket.id}, ${citizen.citizenId}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${exifGeomFragment},
          ${exifCapturedAtIso}, ${JSON.stringify(exif.data)}::jsonb, ${phash}, ${locationMismatchM}, ${flags}
        )
        RETURNING id
      `;

      return { ticketId: ticket.id, reportId: report.id, merged: false, memberCount: 1 };
    });

    // Step 8: post-commit, not part of the transaction — a slow recompute
    // here must never hold the advisory lock or the row locks open.
    await this.recompute.recomputeActiveTicketUrgency();

    return {
      reportId: result.reportId,
      ticketId: result.ticketId,
      merged: result.merged,
      memberCount: result.memberCount,
      barangay: barangay.name,
      elevationM,
      assignedOffice: office,
      flags,
    };
  }

  async getMyReports(citizenId: number): Promise<MyReportRow[]> {
    return this.pg<MyReportRow[]>`
      SELECT
        r.id, r.ticket_id, r.title, t.category, r.citizen_severity, r.image_url,
        t.status, t.urgency_band, b.name AS barangay_name, r.created_at
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      WHERE r.citizen_id = ${citizenId}
      ORDER BY r.created_at DESC
    `;
  }

  // `AND r.citizen_id = ${citizenId}` is the authorization check. A
  // wrong-owner request and a nonexistent report ID both return null, so
  // callers do not leak ownership.
  async getMyReportDetail(citizenId: number, reportId: number) {
    const sql = this.pg;
    const [report] = await sql<MyReportDetail[]>`
      SELECT
        r.id, r.ticket_id, r.title, r.description, r.citizen_severity, r.image_url,
        t.category, t.status, t.urgency_band, b.name AS barangay_name,
        ST_Y(r.pin_geom) AS lat, ST_X(r.pin_geom) AS lng,
        c.first_name AS citizen_first_name, c.last_name AS citizen_last_name,
        r.created_at, t.created_at AS ticket_created_at, t.updated_at AS ticket_updated_at
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      JOIN citizens c ON c.id = r.citizen_id
      WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
    `;

    if (!report) return null;

    const history = await sql<StatusHistoryStep[]>`
      SELECT status, admin_name, changed_at
      FROM status_history WHERE ticket_id = ${report.ticket_id} ORDER BY changed_at
    `;

    return { report, history };
  }

  async getPublicHazardMapData(citizenId: number) {
    const sql = this.pg;
    const [barangays, tickets] = await Promise.all([
      sql<{ id: number; name: string; geojson: string }[]>`
        SELECT id, name, ST_AsGeoJSON(geom) AS geojson FROM barangays ORDER BY name
      `,
      sql<PublicTicketGeoRow[]>`
        SELECT
          t.id, t.category, t.status, b.name AS barangay_name,
          t.urgency_band, t.urgency_score, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
          r.title, r.image_url, own.id AS own_report_id
        FROM tickets t
        JOIN barangays b ON b.id = t.barangay_id
        LEFT JOIN LATERAL (
          SELECT title, image_url FROM reports
          WHERE reports.ticket_id = t.id
          ORDER BY reports.id ASC
          LIMIT 1
        ) r ON true
        LEFT JOIN LATERAL (
          SELECT id FROM reports
          WHERE reports.ticket_id = t.id AND reports.citizen_id = ${citizenId}
          ORDER BY reports.id ASC
          LIMIT 1
        ) own ON true
        WHERE t.status IN ('Reported', 'In Progress')
          AND COALESCE(t.flagged, false) = false
        ORDER BY t.created_at DESC
      `,
    ]);

    return {
      barangays: {
        type: 'FeatureCollection' as const,
        features: barangays.map((b) => ({
          type: 'Feature' as const,
          properties: { id: b.id, name: b.name },
          geometry: JSON.parse(b.geojson),
        })),
      },
      tickets,
    };
  }
}
