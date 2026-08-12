import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { BarangayService } from '../domain/barangay.service';
import { ElevationService } from '../domain/elevation.service';
import { AppConfigService } from '../domain/app-config.service';
import { WeatherService } from '../domain/weather.service';
import { MediaService } from '../domain/media.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { RecomputeService } from '../domain/recompute.service';
import { officeForCategory } from '../common/utils/office';
import { radiusForCategory } from '../common/utils/radius';
import { haversineMeters } from '../common/utils/distance';
import { DUPLICATE_MERGE_WINDOW_DAYS } from '../common/utils/duplicate-detection';
import { computeUrgency } from '../domain/urgency';
import type { ReportInput } from '../contracts/schemas';
import type { CitizenSession } from '../auth/session.service';
import { NotificationsService } from '../notifications/notifications.service';

// PLAN.md §9: layered limits + flag thresholds, ported verbatim from
// app/api/reports/route.ts.
const LOCATION_MISMATCH_THRESHOLD_M = 100;
const STALE_PHOTO_HOURS = 24;
const DUPLICATE_HAMMING_THRESHOLD = 10; // out of 64 bits; ponytail: tune if false-positive rate matters later

// Deliberately count-agnostic — the actual barangay count is config-driven
// (MUNICIPALITY.barangayCount) and has changed before (GADM's 33 -> PSGC's
// 29); a hardcoded number here just drifts again next time the boundary
// dataset changes.
export const OUTSIDE_MUNICIPALITY_MESSAGE =
  "This location falls outside the Municipality of Porac. Reports can only be filed within the municipality's supported barangay boundaries.";

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
  assigned_office: 'MEO' | 'MDRRMO';
  member_count: number;
  // Only the enum, never moderation_note/moderated_by — those carry
  // free-text admin reasoning that must stay internal (CLAUDE.md's
  // "Fraud/integrity flags" section).
  moderation_status: string | null;
  // True when this specific report joined an *already-existing* ticket
  // rather than creating one — i.e. this row's id isn't the earliest report
  // on its ticket. Reports have no "merged" column of their own; this is
  // the citizen-safe way to derive that fact without exposing ticket
  // internals.
  is_merged: boolean;
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
  assigned_office: 'MEO' | 'MDRRMO';
  member_count: number;
  moderation_status: string | null;
  moderated_at: string | null;
  resolution_notes: string | null;
  resolution_image_url: string | null;
  // Never null unless status !== 'Resolved'. Only the timestamp is exposed
  // here — dispute_reason was the citizen's own input, already shown to
  // them once at submission time, and re-displaying it isn't needed for
  // the "hide the action once already disputed" UI check this field exists
  // for. Admins see the reason on Ticket Detail instead.
  disputed_at: string | null;
  resolution_confirmed_at: string | null;
  is_merged: boolean;
}

export interface DisputeResult {
  ticket_id: number;
  disputed_at: string;
}

export interface ConfirmResolutionResult {
  ticket_id: number;
  resolution_confirmed_at: string;
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
    private readonly notifications: NotificationsService,
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
    const rateLimitResult = await this.rateLimit.checkRateLimit(
      citizen.citizenId,
      ip,
      lat,
      lng,
    );
    if (!rateLimitResult.allowed) {
      throw new HttpException(
        rateLimitResult.reason ?? 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Step 2: exact polygon containment — reject outright if outside every
    // configured barangay (PLAN.md §4.1/§12).
    const barangay = await this.barangay.findBarangayForPoint(lat, lng);
    if (!barangay) {
      throw new BadRequestException(OUTSIDE_MUNICIPALITY_MESSAGE);
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
      flags.push(
        `BOUNDARY_FALLBACK:${barangay.name}:${Math.round(barangay.fallbackDistanceM ?? 0)}`,
      );
    }

    if (exif.lat === null || exif.lng === null) {
      flags.push('NO_EXIF');
    } else {
      locationMismatchM = haversineMeters(lat, lng, exif.lat, exif.lng);
      if (locationMismatchM > LOCATION_MISMATCH_THRESHOLD_M) {
        flags.push('LOCATION_MISMATCH');
      }
    }

    const exifCapturedAtIso = exif.capturedAt
      ? exif.capturedAt.toISOString()
      : null;

    if (exif.capturedAt) {
      const ageHours =
        (Date.now() - exif.capturedAt.getTime()) / (1000 * 60 * 60);
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
      (r) =>
        this.media.hammingDistanceHex(phash, r.image_phash) <=
        DUPLICATE_HAMMING_THRESHOLD,
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

      // Both branches below insert an identical report row and differ only
      // in which ticket it attaches to, so the column list lives here once
      // — adding a report column can't be applied to the merge path and
      // missed on the new-ticket path (or vice versa).
      const insertReport = (ticketId: number) => tx<{ id: number }[]>`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
          geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
        )
        VALUES (
          ${ticketId}, ${citizen.citizenId}, ${title}, ${description ?? null}, ${citizenSeverity}, ${elevationM}, ${imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${exifGeomFragment},
          ${exifCapturedAtIso}, ${JSON.stringify(exif.data)}::jsonb, ${phash}, ${locationMismatchM}, ${flags}
        )
        RETURNING id
      `;

      // PLAN.md §6: same category, active ticket, created within the last
      // DUPLICATE_MERGE_WINDOW_DAYS days (anchored to the ticket's original
      // created_at — merging additional reports never slides this window),
      // within the category's tiered radius.
      const [existing] = await tx<{ id: number; member_count: number }[]>`
        SELECT id, member_count
        FROM tickets
        WHERE category = ${category}
          AND status IN ('Reported', 'Under Review', 'In Progress')
          AND created_at > now() - make_interval(days => ${DUPLICATE_MERGE_WINDOW_DAYS})
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radius}
          )
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        LIMIT 1
      `;

      await this.rateLimit.recordRateLimitEvent(
        tx,
        citizen.citizenId,
        ip,
        lat,
        lng,
      );

      if (existing) {
        const [report] = await insertReport(existing.id);

        const memberCount = existing.member_count + 1;

        const [centroid] = await tx<{ lng: number; lat: number }[]>`
          SELECT ST_X(c) AS lng, ST_Y(c) AS lat
          FROM (
            SELECT ST_Centroid(ST_Collect(geom)) AS c FROM reports WHERE ticket_id = ${existing.id}
          ) t
        `;

        const ticketElevationM = await this.elevation.findNearestElevation(
          centroid.lat,
          centroid.lng,
        );
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

        // Every distinct citizen on this ticket (the new reporter included,
        // since their report was just inserted above) gets one notification
        // — a merge is one event from each of their perspectives, atomic
        // with the merge itself. Each links to that citizen's own report on
        // this ticket, not the report that just triggered the merge.
        const citizenRows = await tx<{ citizen_id: number; report_id: number }[]>`
          SELECT DISTINCT ON (citizen_id) citizen_id, id AS report_id
          FROM reports WHERE ticket_id = ${existing.id}
          ORDER BY citizen_id, id ASC
        `;
        for (const row of citizenRows) {
          await this.notifications.createInTx(tx, {
            recipientType: 'citizen',
            recipientId: row.citizen_id,
            type: 'report_merged',
            title: 'Report update',
            message: `Your report has been grouped with ${memberCount - 1} other report${memberCount - 1 === 1 ? '' : 's'} on this issue.`,
            href: `/dashboard/reports/${row.report_id}`,
            entityType: 'ticket',
            entityId: existing.id,
          });
        }

        return {
          ticketId: existing.id,
          reportId: report.id,
          merged: true,
          memberCount,
        };
      }

      const urgency = computeUrgency({
        elevationM,
        elevMin,
        elevMax,
        memberCount: 1,
        rain1hMm,
      });

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

      const [report] = await insertReport(ticket.id);

      await this.notifications.createInTx(tx, {
        recipientType: 'citizen',
        recipientId: citizen.citizenId,
        type: 'report_received',
        title: 'Report received',
        message: 'We received your report and it is now under review.',
        href: `/dashboard/reports/${report.id}`,
        entityType: 'ticket',
        entityId: ticket.id,
      });

      await this.notifications.createInTx(tx, {
        recipientType: 'admin',
        recipientOffice: office,
        type: 'new_citizen_report',
        title: 'New citizen report',
        message: `${category} report in ${barangay.name} - Ticket #${ticket.id}, Report #${report.id}.`,
        href: `/admin/tickets/${ticket.id}`,
        entityType: 'ticket',
        entityId: ticket.id,
      });

      return {
        ticketId: ticket.id,
        reportId: report.id,
        merged: false,
        memberCount: 1,
      };
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
        t.status, t.urgency_band, b.name AS barangay_name, r.created_at,
        t.assigned_office, t.member_count, r.moderation_status,
        r.id != (SELECT MIN(id) FROM reports WHERE ticket_id = r.ticket_id) AS is_merged
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
        r.created_at, t.created_at AS ticket_created_at, t.updated_at AS ticket_updated_at,
        t.assigned_office, t.member_count, r.moderation_status, r.moderated_at, t.resolution_notes,
        t.resolution_image_url, t.disputed_at, t.resolution_confirmed_at,
        r.id != (SELECT MIN(id) FROM reports WHERE ticket_id = r.ticket_id) AS is_merged
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

  // Citizen resolution-feedback loop: reports.mine ownership check (same
  // one-clause pattern as getMyReportDetail above) joined through to the
  // ticket, since "disputed" lives on tickets, not reports — a ticket can
  // have multiple merged reports, and a dispute is about the underlying
  // issue, not one citizen's specific submission. Deliberately never
  // touches urgency_score/priority_score/priority_index/urgency_band or
  // ticket.status — this is a workflow signal layered on top of Resolved,
  // not a scoring input and not a status rollback.
  async disputeReport(
    citizenId: number,
    reportId: number,
    reason: string,
  ): Promise<DisputeResult> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('A short reason is required.');
    }
    if (trimmedReason.length > 1000) {
      throw new BadRequestException('Reason must be 1000 characters or fewer.');
    }

    const sql = this.pg;
    const [row] = await sql<
      { ticket_id: number; status: string; assigned_office: 'MEO' | 'MDRRMO'; disputed_at: string | null; title: string }[]
    >`
      SELECT t.id AS ticket_id, t.status, t.assigned_office, t.disputed_at,
        (SELECT r2.title FROM reports r2 WHERE r2.ticket_id = t.id ORDER BY r2.created_at ASC, r2.id ASC LIMIT 1) AS title
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
    `;
    if (!row) throw new NotFoundException('Report not found');

    if (row.status !== 'Resolved') {
      throw new BadRequestException('Only resolved tickets can be disputed.');
    }
    if (row.disputed_at) {
      throw new BadRequestException('This report has already been flagged as unresolved.');
    }

    return sql.begin(async (tx) => {
      // The WHERE clause's own `disputed_at IS NULL` guard (not a separate
      // exists-check before this UPDATE) is what actually prevents two
      // concurrent dispute attempts from both succeeding — same "exists-check
      // and UPDATE as one statement" pattern moderation.service.ts's
      // moderateReport uses for the identical race.
      const [updated] = await tx<{ disputed_at: string }[]>`
        UPDATE tickets
        SET disputed_at = now(), dispute_reason = ${trimmedReason}
        WHERE id = ${row.ticket_id} AND disputed_at IS NULL
        RETURNING disputed_at
      `;
      if (!updated) {
        throw new BadRequestException('This report has already been flagged as unresolved.');
      }

      await this.notifications.createInTx(tx, {
        recipientType: 'admin',
        recipientOffice: row.assigned_office,
        type: 'ticket_disputed',
        title: 'Citizen reports issue not fixed',
        message: `A citizen reported that "${row.title}" (Ticket #${row.ticket_id}) is not actually fixed.`,
        href: `/admin/tickets/${row.ticket_id}`,
        entityType: 'ticket',
        entityId: row.ticket_id,
      });

      return { ticket_id: row.ticket_id, disputed_at: updated.disputed_at };
    });
  }

  // Citizen resolution-feedback loop, positive path: same ownership pattern
  // and same race-safe "guard clause on the UPDATE itself" as disputeReport
  // above. No notification — unlike a dispute, a confirmation isn't
  // actionable by the office, so there's nothing for them to be alerted to.
  // Never touches any scoring field or ticket.status — see CLAUDE.md's
  // Severity/Urgency/Priority terminology section.
  async confirmResolution(
    citizenId: number,
    reportId: number,
  ): Promise<ConfirmResolutionResult> {
    const sql = this.pg;
    const [row] = await sql<
      { ticket_id: number; status: string; disputed_at: string | null; resolution_confirmed_at: string | null }[]
    >`
      SELECT t.id AS ticket_id, t.status, t.disputed_at, t.resolution_confirmed_at
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
    `;
    if (!row) throw new NotFoundException('Report not found');

    if (row.status !== 'Resolved') {
      throw new BadRequestException('Only resolved tickets can be confirmed.');
    }
    if (row.disputed_at) {
      throw new BadRequestException('This report has already been flagged as unresolved.');
    }
    if (row.resolution_confirmed_at) {
      throw new BadRequestException('This report has already been confirmed as fixed.');
    }

    const [updated] = await sql<{ resolution_confirmed_at: string }[]>`
      UPDATE tickets
      SET resolution_confirmed_at = now()
      WHERE id = ${row.ticket_id} AND resolution_confirmed_at IS NULL AND disputed_at IS NULL
      RETURNING resolution_confirmed_at
    `;
    if (!updated) {
      throw new BadRequestException('This report has already been confirmed as fixed.');
    }

    return { ticket_id: row.ticket_id, resolution_confirmed_at: updated.resolution_confirmed_at };
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
