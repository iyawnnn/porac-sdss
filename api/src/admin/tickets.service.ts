import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  barangayId?: number;
  sort?: TicketSort;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminTicketRow {
  id: number;
  category: string;
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
}

export interface PaginatedTickets {
  tickets: AdminTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

@Injectable()
export class TicketsService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly weather: WeatherService,
    private readonly media: MediaService,
  ) {}

  // URL <-> filter mapping shared between SSR first paint (Phase 8) and the
  // client refetch route, so the two never drift.
  parseTicketQuery(
    query: Record<string, string | undefined>,
    sessionOffice?: 'MEO' | 'MDRRMO',
  ): Required<Pick<AdminTicketFilters, 'status' | 'sort' | 'page' | 'limit'>> &
    Pick<AdminTicketFilters, 'office' | 'urgency' | 'barangayId' | 'search'> {
    const office =
      query.office === 'all'
        ? undefined
        : query.office === 'MEO' || query.office === 'MDRRMO'
          ? query.office
          : sessionOffice;
    const status =
      query.status === 'all' ||
      query.status === 'active' ||
      TICKET_STATUSES.includes(query.status as TicketStatus)
        ? (query.status as AdminTicketFilters['status'])
        : 'active';
    const urgency = ['Low', 'Medium', 'Critical'].includes(query.urgency ?? '')
      ? query.urgency
      : undefined;
    const barangayId = query.barangayId ? Number(query.barangayId) : undefined;
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
      urgency,
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
      SELECT t.id, t.category, t.barangay_id, b.name AS barangay_name, t.member_count,
        t.urgency_score, t.urgency_band, t.priority_index, t.priority_score, t.urgency_level,
        t.assigned_office, t.status, t.created_at,
        COUNT(*) OVER ()::int AS total_count
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        ${statusClause}
        AND (${filters.urgency ?? null}::text IS NULL OR t.urgency_band = ${filters.urgency ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
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

  async getTicketsGeo(
    office: 'MEO' | 'MDRRMO' | null,
  ): Promise<AdminTicketGeoRow[]> {
    const sql = this.pg;
    return sql<AdminTicketGeoRow[]>`
      SELECT t.id, t.category, t.status, t.assigned_office, b.name AS barangay_name,
        t.urgency_score, t.urgency_band, t.priority_index, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
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

  async getTicketDetail(id: number) {
    const sql = this.pg;
    const [ticket] = await sql<TicketDetail[]>`
      SELECT t.id, t.category, t.barangay_id, b.name AS barangay_name, ST_AsGeoJSON(b.geom) AS barangay_geojson,
        t.status, t.assigned_office, t.member_count, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
        t.elevation_m, t.elevation_factor, t.precipitation_factor,
        t.cluster_factor, t.urgency_score, t.urgency_band, t.priority_index,
        t.priority_score, t.urgency_level,
        t.resolution_image_url, t.resolution_notes, t.created_at, t.updated_at
      FROM tickets t
      JOIN barangays b ON b.id = t.barangay_id
      WHERE t.id = ${id}
    `;

    if (!ticket) return null;

    const reports = await sql<TicketReport[]>`
      SELECT id, title, description, citizen_severity, image_url,
        elevation_m, exif_captured_at, exif_data, location_mismatch_m, created_at
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
  ): Promise<TicketPriorityContext | null> {
    const sql = this.pg;
    const [row] = await sql<
      {
        barangay_id: number;
        created_at: string;
        severity_rank: number;
        active_barangay_count: number;
        max_active_barangay_count: number;
      }[]
    >`
      WITH barangay_density AS (
        SELECT barangay_id, COUNT(*)::int AS active_barangay_count
        FROM tickets
        WHERE status IN ('Reported', 'Under Review', 'In Progress')
        GROUP BY barangay_id
      )
      SELECT t.barangay_id, t.created_at,
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
    const [ticket] = await sql<{ status: TicketStatus }[]>`
      SELECT status FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');

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
      if (imageBuffer)
        resolutionImageUrl = await this.media.uploadImage(imageBuffer);
    }

    await sql.begin(async (tx) => {
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
    });

    return { status: nextStatus };
  }

  async reassignOffice(
    ticketId: number,
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
  ): Promise<{ assignedOffice: 'MEO' | 'MDRRMO' }> {
    const sql = this.pg;
    const [ticket] = await sql<{ assigned_office: 'MEO' | 'MDRRMO' }[]>`
      SELECT assigned_office FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
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
    });

    return { assignedOffice: toOffice };
  }
}
