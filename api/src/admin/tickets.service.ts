import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { WeatherService } from '../domain/weather.service';
import { MediaService } from '../domain/media.service';
import {
  computePriorityBreakdown,
  severityFromRank,
  type PriorityBreakdown,
} from '../common/utils/scoring';
import type { UrgencyLevel } from '../domain/urgency';
import type { AdminSession } from '../auth/session.service';
import {
  resolveOfficeScope,
  assertOfficeAccess,
} from '../common/authz/admin-scope';
import {
  CATEGORIES,
  TICKET_RESOLUTION_NOTES_MAX_LENGTH,
} from '../contracts/schemas';
import { NotificationsService } from '../notifications/notifications.service';
import { EMAIL_SERVICE, type EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import { AdminAuditService } from './admin-audit.service';
import {
  TICKET_STATUSES,
  PAGE_LIMITS,
  DEFAULT_PAGE_LIMIT,
  NEXT_STATUS,
  type TicketStatus,
  type TicketSort,
} from './ticket-constants';

export interface AdminTicketFilters {
  office?: 'MEO' | 'MDRRMO';
  status?: 'active' | 'all' | TicketStatus;
  urgency?: string;
  category?: string;
  barangayId?: number;
  // Citizen resolution-feedback loop: true narrows to tickets a citizen
  // has flagged as "not actually fixed" (tickets.disputed_at IS NOT NULL).
  // A pure list-narrowing filter, same shape as WorkOrdersService's
  // `overdue` boolean — never absent-means-false, absent means unfiltered.
  disputed?: boolean;
  sort?: TicketSort;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminTicketRow {
  id: number;
  category: string;
  title: string | null;
  barangay_id: number;
  barangay_name: string;
  member_count: number;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  urgency_level: UrgencyLevel | null;
  assigned_office: string;
  status: string;
  created_at: string;
  disputed_at: string | null;
}

export interface PaginatedTickets {
  tickets: AdminTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Feeds ReportsService's CSV export — deliberately a narrower row shape than
// AdminTicketRow (no title, which comes from a citizen-authored report and
// isn't a stable/moderated field worth putting in an operational handoff
// export).
export interface AdminTicketExportRow {
  id: number;
  status: string;
  assigned_office: string;
  category: string;
  barangay_name: string;
  urgency_band: string | null;
  priority_score: number | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminTicketGeoRow {
  id: number;
  category: string;
  status: string;
  assigned_office: string;
  barangay_name: string;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  lat: number;
  lng: number;
  title: string | null;
  image_url: string | null;
}

export interface TicketDetail {
  id: number;
  category: string;
  barangay_id: number;
  barangay_name: string;
  barangay_geojson: string | null;
  status: string;
  assigned_office: string;
  member_count: number;
  lat: number;
  lng: number;
  elevation_m: number | null;
  elevation_factor: number | null;
  precipitation_factor: number | null;
  cluster_factor: number | null;
  urgency_score: number | null;
  urgency_band: string | null;
  priority_index: number | null;
  priority_score: number | null;
  urgency_level: UrgencyLevel | null;
  resolution_image_url: string | null;
  resolution_notes: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketReport {
  id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  elevation_m: number | null;
  exif_captured_at: string | null;
  exif_data: Record<string, unknown> | null;
  location_mismatch_m: number | null;
  created_at: string;
  flags: string[] | null;
  moderation_status: string | null;
}

export interface TicketStatusHistoryRow {
  status: string;
  admin_name: string | null;
  changed_at: string;
}

export interface TicketReassignmentRow {
  from_office: string;
  to_office: string;
  admin_name: string | null;
  reassigned_at: string;
}

export interface TicketPriorityContext {
  breakdown: PriorityBreakdown;
  rain1hMm: number;
}

// No entry for 'Reported' (the ladder's start, never a transition target)
// or 'Rejected' (NEXT_STATUS has no transition that produces it — this
// codebase has no ticket-rejection call site yet; wire one here if that
// feature is added later).
const STATUS_NOTIFICATION: Partial<
  Record<TicketStatus, { type: string; title: string; message: string }>
> = {
  'Under Review': {
    type: 'ticket_under_review',
    title: 'Report under review',
    message: 'Your report is now under review by the assigned office.',
  },
  'In Progress': {
    type: 'ticket_in_progress',
    title: 'Work in progress',
    message: 'Work has started on your report.',
  },
  Resolved: {
    type: 'ticket_resolved',
    title: 'Report resolved',
    message: 'Your report has been marked resolved.',
  },
};

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly weather: WeatherService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AdminAuditService,
  ) {}

  // URL <-> filter mapping shared between SSR first paint (Phase 8) and the
  // client refetch route, so the two never drift.
  parseTicketQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ): Required<Pick<AdminTicketFilters, 'status' | 'sort' | 'page' | 'limit'>> &
    Pick<
      AdminTicketFilters,
      'office' | 'urgency' | 'category' | 'barangayId' | 'search' | 'disputed'
    > {
    const requestedOffice =
      query.office === 'all' ||
      query.office === 'MEO' ||
      query.office === 'MDRRMO'
        ? query.office
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);
    const status =
      query.status === 'all' ||
      query.status === 'active' ||
      TICKET_STATUSES.includes(query.status as TicketStatus)
        ? (query.status as AdminTicketFilters['status'])
        : 'active';
    const urgency = ['Low', 'Medium', 'Critical'].includes(query.urgency ?? '')
      ? query.urgency
      : undefined;
    const category = (CATEGORIES as readonly string[]).includes(
      query.category ?? '',
    )
      ? query.category
      : undefined;
    const barangayId = query.barangayId ? Number(query.barangayId) : undefined;
    const disputed = query.disputed === 'true' ? true : undefined;
    const sort: TicketSort =
      query.sort === 'priority_asc' || query.sort === 'newest'
        ? query.sort
        : 'priority_desc';
    const search = query.search?.trim() || undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(
      Number(query.limit) as (typeof PAGE_LIMITS)[number],
    )
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;

    return {
      office,
      status: status ?? 'active',
      disputed,
      urgency,
      category,
      barangayId,
      sort,
      search,
      page,
      limit,
    };
  }

  async getTicketsForAdmin(
    filters: AdminTicketFilters = {},
  ): Promise<PaginatedTickets> {
    const sql = this.pg;
    const status = filters.status ?? 'active';
    const statusClause =
      status === 'active'
        ? sql`AND t.status IN ('Reported', 'Under Review', 'In Progress')`
        : status === 'all'
          ? sql``
          : sql`AND t.status = ${status}::ticket_status`;
    const orderBy =
      filters.sort === 'priority_asc'
        ? sql`t.priority_score ASC NULLS LAST, t.created_at DESC`
        : filters.sort === 'newest'
          ? sql`t.created_at DESC`
          : sql`t.priority_score DESC NULLS LAST, t.created_at DESC`;

    const search = filters.search?.trim() || null;
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(
      1,
      Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const offset = (page - 1) * limit;

    // COUNT(*) OVER() rides along with the page query so the WHERE clause
    // (filters + search) can't drift between a separate count query and the
    // row query.
    const rows = await sql<(AdminTicketRow & { total_count: number })[]>`
      SELECT t.id, t.category,
        (SELECT r.title FROM reports r WHERE r.ticket_id = t.id ORDER BY r.created_at ASC, r.id ASC LIMIT 1) AS title,
        t.barangay_id, b.name AS barangay_name, t.member_count,
        t.urgency_score, t.urgency_band, t.priority_index, t.priority_score, t.urgency_level,
        t.assigned_office, t.status, t.created_at, t.disputed_at,
        COUNT(*) OVER ()::int AS total_count
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        ${statusClause}
        AND (${filters.urgency ?? null}::text IS NULL OR t.urgency_band = ${filters.urgency ?? null})
        AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
        AND (${filters.disputed ? true : null}::boolean IS NULL OR t.disputed_at IS NOT NULL)
        AND (
          ${search}::text IS NULL
          OR b.name ILIKE '%' || ${search} || '%'
          OR (${searchId}::int IS NOT NULL AND t.id = ${searchId}::int)
          OR EXISTS (
            SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND r.title ILIKE '%' || ${search} || '%'
          )
        )
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows[0]?.total_count ?? 0;

    return {
      tickets: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ponytail: capped at 5,000 rows rather than streamed/paginated — fine at
  // this LGU's current ticket volume; revisit with a cursor/streaming CSV
  // writer if a real municipality-scale dataset ever needs a bigger export.
  async getTicketsForExport(
    filters: AdminTicketFilters & { dateFrom?: Date; dateTo?: Date } = {},
  ): Promise<AdminTicketExportRow[]> {
    const sql = this.pg;
    const status = filters.status ?? 'active';
    const statusClause =
      status === 'active'
        ? sql`AND t.status IN ('Reported', 'Under Review', 'In Progress')`
        : status === 'all'
          ? sql``
          : sql`AND t.status = ${status}::ticket_status`;

    const search = filters.search?.trim() || null;
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;
    // postgres.js's tagged template needs a string, not a raw Date, when
    // the same placeholder value is reused across multiple interpolation
    // sites in one query (it otherwise throws ERR_INVALID_ARG_TYPE trying
    // to byte-serialize the Date directly) — ISO strings sidestep that.
    const dateFrom = filters.dateFrom?.toISOString() ?? null;
    const dateTo = filters.dateTo?.toISOString() ?? null;

    return sql<AdminTicketExportRow[]>`
      SELECT t.id, t.status, t.assigned_office, t.category, b.name AS barangay_name,
        t.urgency_band, t.priority_score, t.member_count, t.created_at, t.updated_at
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        ${statusClause}
        AND (${filters.urgency ?? null}::text IS NULL OR t.urgency_band = ${filters.urgency ?? null})
        AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
        AND (${dateFrom}::timestamptz IS NULL OR t.created_at >= ${dateFrom}::timestamptz)
        AND (${dateTo}::timestamptz IS NULL OR t.created_at <= ${dateTo}::timestamptz)
        AND (
          ${search}::text IS NULL
          OR b.name ILIKE '%' || ${search} || '%'
          OR (${searchId}::int IS NOT NULL AND t.id = ${searchId}::int)
          OR EXISTS (
            SELECT 1 FROM reports r WHERE r.ticket_id = t.id AND r.title ILIKE '%' || ${search} || '%'
          )
        )
      ORDER BY t.created_at DESC
      LIMIT 5000
    `;
  }

  async getTicketsGeo(
    admin: Pick<AdminSession, 'role' | 'office'>,
    requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
  ): Promise<AdminTicketGeoRow[]> {
    const office = resolveOfficeScope(admin, requestedOffice) ?? null;
    const sql = this.pg;
    return sql<AdminTicketGeoRow[]>`
      SELECT t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
        t.urgency_score, t.urgency_band, t.priority_index, t.priority_score, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        r.title, r.image_url
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN LATERAL (
        SELECT title, image_url FROM reports
        WHERE reports.ticket_id = t.id
        ORDER BY reports.id ASC
        LIMIT 1
      ) r ON true
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
        AND (${office}::text IS NULL OR t.assigned_office = ${office}::office)
    `;
  }

  async getTicketDetail(
    id: number,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ) {
    const sql = this.pg;
    const [ticket] = await sql<TicketDetail[]>`
      SELECT t.id, t.category, t.barangay_id, b.name AS barangay_name, ST_AsGeoJSON(b.geom) AS barangay_geojson,
        t.status, t.assigned_office, t.member_count, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        t.elevation_m, t.elevation_factor, t.precipitation_factor,
        t.cluster_factor, t.urgency_score, t.urgency_band, t.priority_index,
        t.priority_score, t.urgency_level,
        t.resolution_image_url, t.resolution_notes, t.created_at, t.updated_at,
        t.disputed_at, t.dispute_reason
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE t.id = ${id}
    `;

    if (!ticket) return null;
    assertOfficeAccess(admin, ticket.assigned_office as 'MEO' | 'MDRRMO');

    const reports = await sql<TicketReport[]>`
      SELECT id, title, description, citizen_severity, image_url,
        elevation_m, exif_captured_at, exif_data, location_mismatch_m, created_at,
        flags, moderation_status
      FROM reports WHERE ticket_id = ${id} ORDER BY created_at
    `;
    const history = await sql<TicketStatusHistoryRow[]>`
      SELECT status, admin_name, changed_at
      FROM status_history WHERE ticket_id = ${id} ORDER BY changed_at
    `;
    const reassignments = await sql<TicketReassignmentRow[]>`
      SELECT from_office, to_office, admin_name, reassigned_at
      FROM office_reassignments WHERE ticket_id = ${id} ORDER BY reassigned_at
    `;

    return { ticket, reports, history, reassignments };
  }

  // Live re-derivation of the same inputs RecomputeService uses for this one
  // ticket, scoped by WHERE ticket_id — only meaningful while the ticket is
  // still active, since barangay density is computed over active tickets
  // only and freezes once resolved/rejected.
  async getTicketPriorityContext(
    ticketId: number,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ): Promise<TicketPriorityContext | null> {
    const sql = this.pg;
    const [row] = await sql<
      {
        barangay_id: number;
        created_at: string;
        severity_rank: number;
        active_barangay_count: number;
        max_active_barangay_count: number;
        assigned_office: 'MEO' | 'MDRRMO';
      }[]
    >`
      WITH barangay_density AS (
        SELECT barangay_id, COUNT(*)::int AS active_barangay_count
        FROM tickets
        WHERE status IN ('Reported', 'Under Review', 'In Progress')
        GROUP BY barangay_id
      )
      SELECT t.barangay_id, t.created_at, t.assigned_office,
        COALESCE((
          SELECT MAX(CASE citizen_severity
            WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END)
          FROM reports WHERE ticket_id = t.id
        ), 1)::int AS severity_rank,
        COALESCE(d.active_barangay_count, 0) AS active_barangay_count,
        COALESCE((SELECT MAX(active_barangay_count) FROM barangay_density), 0) AS max_active_barangay_count
      FROM tickets t
      LEFT JOIN barangay_density d ON d.barangay_id = t.barangay_id
      WHERE t.id = ${ticketId}
    `;
    if (!row) return null;
    assertOfficeAccess(admin, row.assigned_office);

    const rain1hMm = await this.weather.getCurrentRain1hMm();
    const breakdown = computePriorityBreakdown({
      severity: severityFromRank(row.severity_rank),
      createdAt: row.created_at,
      activeBarangayCount: row.active_barangay_count,
      maxActiveBarangayCount: row.max_active_barangay_count,
    });

    return { breakdown, rain1hMm };
  }

  // Resolving is the only transition that can carry a proof photo + notes;
  // every other transition ignores notes/imageBuffer entirely.
  async advanceStatus(
    ticketId: number,
    admin: AdminSession,
    notes: string | undefined,
    imageBuffer: Buffer | undefined,
  ): Promise<{ status: TicketStatus }> {
    const sql = this.pg;
    const [ticket] = await sql<
      {
        status: TicketStatus;
        assigned_office: 'MEO' | 'MDRRMO';
        category: string;
      }[]
    >`
      SELECT status, assigned_office, category FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
    assertOfficeAccess(admin, ticket.assigned_office);

    const nextStatus = NEXT_STATUS[ticket.status];
    if (!nextStatus) {
      throw new BadRequestException(
        `No transition available from ${ticket.status}`,
      );
    }

    let resolutionImageUrl: string | null = null;
    let resolutionNotes: string | null = null;
    if (nextStatus === 'Resolved') {
      resolutionNotes = notes?.trim() || null;
      if (
        resolutionNotes &&
        resolutionNotes.length > TICKET_RESOLUTION_NOTES_MAX_LENGTH
      ) {
        throw new BadRequestException(
          `resolution notes must be ${TICKET_RESOLUTION_NOTES_MAX_LENGTH} characters or fewer.`,
        );
      }
      if (imageBuffer)
        resolutionImageUrl = await this.media.uploadImage(imageBuffer);
    }

    const emailRecipients = await sql.begin(async (tx) => {
      await tx`
        UPDATE tickets SET
          status = ${nextStatus},
          resolution_image_url = COALESCE(${resolutionImageUrl}, resolution_image_url),
          resolution_notes = COALESCE(${resolutionNotes}, resolution_notes),
          updated_at = now()
        WHERE id = ${ticketId}
      `;
      await tx`
        INSERT INTO status_history (ticket_id, status, admin_id, admin_name, changed_at)
        VALUES (${ticketId}, ${nextStatus}, ${admin.adminId}, ${admin.adminName}, now())
      `;
      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: 'ticket_status_advanced',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        metadata: { from: ticket.status, to: nextStatus },
      });

      const notice = STATUS_NOTIFICATION[nextStatus];
      if (!notice) return [];

      const citizenRows = await tx<
        { citizen_id: number; report_id: number; email: string }[]
      >`
        SELECT DISTINCT ON (r.citizen_id) r.citizen_id, r.id AS report_id, c.email
        FROM reports r
        JOIN citizens c ON c.id = r.citizen_id
        WHERE r.ticket_id = ${ticketId}
        ORDER BY r.citizen_id, r.id ASC
      `;
      for (const row of citizenRows) {
        await this.notifications.createInTx(tx, {
          recipientType: 'citizen',
          recipientId: row.citizen_id,
          type: notice.type,
          title: notice.title,
          message: notice.message,
          href: `/dashboard/reports/${row.report_id}`,
          entityType: 'ticket',
          entityId: ticketId,
        });
      }

      // Email is selective, not one-per-status — only Resolved/Rejected
      // warrant an email (the rest stay in-app-only), per PLAN.md's
      // notification-system design decision.
      return nextStatus === 'Resolved' || nextStatus === 'Rejected'
        ? citizenRows.map((row) => ({
            email: row.email,
            reportId: row.report_id,
          }))
        : [];
    });

    if (emailRecipients.length > 0) {
      const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
      // Post-commit, never inside the transaction — an external HTTP call
      // has no place holding a DB transaction open. Both send methods
      // never throw (ResendEmailService's existing contract), but the
      // try/catch here is the belt-and-suspenders guarantee that a
      // misbehaving EmailService implementation can never undo or block
      // the status change that already committed.
      for (const recipient of emailRecipients) {
        try {
          const reportUrl = `${webOrigin}/dashboard/reports/${recipient.reportId}`;
          if (nextStatus === 'Resolved') {
            await this.email.sendReportResolved(recipient.email, reportUrl);
          } else {
            await this.email.sendReportRejected(recipient.email, reportUrl);
          }
        } catch {
          // Never let an email failure surface to the caller — the status
          // change and in-app notification already committed.
        }
      }
    }

    return { status: nextStatus };
  }

  async reassignOffice(
    ticketId: number,
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
  ): Promise<{ assignedOffice: 'MEO' | 'MDRRMO' }> {
    const sql = this.pg;
    const [ticket] = await sql<
      { assigned_office: 'MEO' | 'MDRRMO'; category: string }[]
    >`
      SELECT assigned_office, category FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
    assertOfficeAccess(admin, ticket.assigned_office);
    if (ticket.assigned_office === toOffice) {
      throw new BadRequestException(
        `Ticket is already assigned to ${toOffice}`,
      );
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE tickets SET assigned_office = ${toOffice}, updated_at = now() WHERE id = ${ticketId}`;
      await tx`
        INSERT INTO office_reassignments (ticket_id, from_office, to_office, admin_id, admin_name)
        VALUES (${ticketId}, ${ticket.assigned_office}, ${toOffice}, ${admin.adminId}, ${admin.adminName})
      `;
      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: 'ticket_reassigned',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId} (${ticket.category})`,
        metadata: { from: ticket.assigned_office, to: toOffice },
      });
    });

    return { assignedOffice: toOffice };
  }
}
