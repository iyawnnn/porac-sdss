import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { ALL_CATEGORIES, MODERATION_NOTE_MAX_LENGTH } from '../contracts/schemas';
import type { AdminSession } from '../auth/session.service';
import {
  resolveOfficeScope,
  assertOfficeAccess,
} from '../common/authz/admin-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';
import {
  DEFAULT_PAGE_LIMIT,
  FLAG_TYPES,
  MODERATION_STATUSES,
  PAGE_LIMITS,
  type FlagType,
  type ModerationStatusFilter,
} from './ticket-constants';

export type ModerationAction = 'dismiss' | 'quarantine' | 'duplicate';

export interface ModerationQueueRow {
  id: number;
  ticket_id: number;
  title: string;
  description: string | null;
  citizen_severity: string;
  image_url: string;
  flags: string[];
  location_mismatch_m: number | null;
  exif_captured_at: string | null;
  created_at: string;
  category: string;
  barangay_name: string;
  barangay_id: number;
  assigned_office: 'MEO' | 'MDRRMO';
  citizen_id: number;
  citizen_name: string;
  citizen_report_count: number;
  citizen_flag_count: number;
  moderation_status: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
}

export interface ModerationFilters {
  status?: ModerationStatusFilter;
  category?: string;
  office?: 'MEO' | 'MDRRMO';
  barangayId?: number;
  flag?: FlagType;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedModeration {
  reports: ModerationQueueRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ModerationStats {
  pending: number;
  quarantined: number;
  dismissed: number;
  duplicate: number;
  avgResolutionHours: number | null;
}

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  // Mirrors tickets.service.ts's parseTicketQuery: office is clamped to the
  // requesting admin's own office via resolveOfficeScope — a non-system-admin
  // cannot widen it by passing 'all' or the other office in the query.
  parseModerationQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ): ModerationFilters {
    const requestedOffice =
      query.office === 'all' ||
      query.office === 'MEO' ||
      query.office === 'MDRRMO'
        ? query.office
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);
    const status =
      query.status === 'all' ||
      (MODERATION_STATUSES as string[]).includes(query.status ?? '')
        ? (query.status as ModerationStatusFilter)
        : 'pending';
    const category = (ALL_CATEGORIES as readonly string[]).includes(
      query.category ?? '',
    )
      ? query.category
      : undefined;
    const barangayId = query.barangayId ? Number(query.barangayId) : undefined;
    const flag = (FLAG_TYPES as string[]).includes(query.flag ?? '')
      ? (query.flag as FlagType)
      : undefined;
    const search = query.search?.trim() || undefined;
    const from = query.from?.trim() || undefined;
    const to = query.to?.trim() || undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(
      Number(query.limit) as (typeof PAGE_LIMITS)[number],
    )
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;

    return {
      status,
      category,
      office,
      barangayId,
      flag,
      search,
      from,
      to,
      page,
      limit,
    };
  }

  async getModerationQueue(
    filters: ModerationFilters = {},
  ): Promise<PaginatedModeration> {
    const sql = this.pg;
    const status = filters.status ?? 'pending';
    const statusClause =
      status === 'all'
        ? sql``
        : status === 'pending'
          ? sql`AND r.moderation_status IS NULL`
          : sql`AND r.moderation_status = ${status}`;
    const flagClause = filters.flag
      ? sql`AND EXISTS (
          SELECT 1 FROM unnest(r.flags) f
          WHERE f = ${filters.flag} OR f LIKE ${filters.flag + ':%'}
        )`
      : sql``;
    const search = filters.search?.trim() || null;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(
      1,
      Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const offset = (page - 1) * limit;

    // COUNT(*) OVER() rides along with the page query, same pattern as
    // tickets.service.ts's getTicketsForAdmin — filters can't drift between
    // a separate count query and the row query.
    const rows = await sql<(ModerationQueueRow & { total_count: number })[]>`
      SELECT
        r.id, r.ticket_id, r.title, r.description, r.citizen_severity, r.image_url, r.flags,
        r.location_mismatch_m, r.exif_captured_at, r.created_at,
        r.moderation_status, r.moderation_note, r.moderated_at, r.moderated_by,
        t.category, t.assigned_office, b.id AS barangay_id, b.name AS barangay_name,
        c.id AS citizen_id, (c.first_name || ' ' || c.last_name) AS citizen_name,
        (SELECT COUNT(*) FROM reports r2 WHERE r2.citizen_id = r.citizen_id)::int AS citizen_report_count,
        (SELECT COUNT(*) FROM reports r3 WHERE r3.citizen_id = r.citizen_id
          AND r3.flags IS NOT NULL AND array_length(r3.flags, 1) > 0)::int AS citizen_flag_count,
        COUNT(*) OVER ()::int AS total_count
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      JOIN citizens c ON c.id = r.citizen_id
      WHERE r.flags IS NOT NULL AND array_length(r.flags, 1) > 0
        ${statusClause}
        ${flagClause}
        AND (${filters.office ?? null}::text IS NULL OR t.assigned_office = ${filters.office ?? null}::office)
        AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
        AND (${filters.barangayId ?? null}::int IS NULL OR t.barangay_id = ${filters.barangayId ?? null}::int)
        AND (${filters.from ?? null}::date IS NULL OR r.created_at >= ${filters.from ?? null}::date)
        AND (${filters.to ?? null}::date IS NULL OR r.created_at < (${filters.to ?? null}::date + interval '1 day'))
        AND (
          ${search}::text IS NULL
          OR r.title ILIKE '%' || ${search} || '%'
          OR c.first_name ILIKE '%' || ${search} || '%'
          OR c.last_name ILIKE '%' || ${search} || '%'
        )
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows[0]?.total_count ?? 0;
    return {
      reports: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getModerationStats(
    office?: 'MEO' | 'MDRRMO',
  ): Promise<ModerationStats> {
    const sql = this.pg;
    const [row] = await sql<
      {
        pending: string;
        quarantined: string;
        dismissed: string;
        duplicate: string;
        avg_hours: number | null;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE r.moderation_status IS NULL) AS pending,
        COUNT(*) FILTER (WHERE r.moderation_status = 'quarantined') AS quarantined,
        COUNT(*) FILTER (WHERE r.moderation_status = 'dismissed') AS dismissed,
        COUNT(*) FILTER (WHERE r.moderation_status = 'duplicate') AS duplicate,
        AVG(EXTRACT(EPOCH FROM (r.moderated_at - r.created_at)) / 3600)
          FILTER (WHERE r.moderated_at IS NOT NULL) AS avg_hours
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.flags IS NOT NULL AND array_length(r.flags, 1) > 0
        AND (${office ?? null}::text IS NULL OR t.assigned_office = ${office ?? null}::office)
    `;
    return {
      pending: Number(row?.pending ?? 0),
      quarantined: Number(row?.quarantined ?? 0),
      dismissed: Number(row?.dismissed ?? 0),
      duplicate: Number(row?.duplicate ?? 0),
      avgResolutionHours: row?.avg_hours != null ? Number(row.avg_hours) : null,
    };
  }

  // The exists-check and the UPDATE now happen as one statement — the
  // `moderation_status IS NULL` guard moved onto the UPDATE's WHERE clause
  // (was a separate SELECT before the UPDATE), so two concurrent
  // moderations of the same report can no longer both pass the guard and
  // both write. Only the row that actually flips NULL -> a status is
  // returned; a losing concurrent call sees zero rows updated and reports
  // "already moderated", same as if it had lost a lock.
  async moderateReport(
    reportId: number,
    action: ModerationAction,
    admin: AdminSession,
    canonicalReportId?: number,
    note?: string,
  ): Promise<{ status: string }> {
    const sql = this.pg;
    const trimmedNote = note?.trim() || undefined;
    if (trimmedNote && trimmedNote.length > MODERATION_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `note must be ${MODERATION_NOTE_MAX_LENGTH} characters or fewer.`,
      );
    }

    const [report] = await sql<{ assigned_office: 'MEO' | 'MDRRMO' }[]>`
      SELECT t.assigned_office FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ${reportId}
    `;
    if (!report) throw new NotFoundException('Report not found');
    assertOfficeAccess(admin, report.assigned_office);

    if (action === 'duplicate') {
      if (!canonicalReportId)
        throw new BadRequestException('canonicalReportId is required');
      const [canonical] = await sql<
        { id: number }[]
      >`SELECT id FROM reports WHERE id = ${canonicalReportId}`;
      if (!canonical)
        throw new BadRequestException('Canonical report not found');
    }

    // Quarantine hides a citizen's report from the public map — that's
    // impactful enough that the acting admin has to say why, not just
    // click a button. Dismiss/duplicate don't hide anything, so a note is
    // optional there.
    if (action === 'quarantine' && !trimmedNote) {
      throw new BadRequestException(
        'A moderation note is required to quarantine a report.',
      );
    }

    const status =
      action === 'dismiss'
        ? 'dismissed'
        : action === 'quarantine'
          ? 'quarantined'
          : 'duplicate';
    const note_ =
      action === 'duplicate'
        ? String(canonicalReportId)
        : (trimmedNote ?? null);

    return sql.begin(async (tx) => {
      const [updated] = await tx<
        { ticket_id: number; citizen_id: number; title: string }[]
      >`
        UPDATE reports
        SET moderation_status = ${status}, moderation_note = ${note_},
          moderated_at = now(), moderated_by = ${admin.adminName}
        WHERE id = ${reportId} AND moderation_status IS NULL
        RETURNING ticket_id, citizen_id, title
      `;

      if (!updated) {
        const [existing] = await tx<{ moderation_status: string | null }[]>`
          SELECT moderation_status FROM reports WHERE id = ${reportId}
        `;
        if (!existing) throw new NotFoundException('Report not found');
        throw new BadRequestException(
          `Report was already ${existing.moderation_status}`,
        );
      }

      if (action === 'quarantine') {
        await tx`UPDATE tickets SET flagged = true, updated_at = now() WHERE id = ${updated.ticket_id}`;
      }

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: 'report_moderated',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `"${updated.title}" (report #${reportId})`,
        metadata: { action, note: note_ },
      });

      // Only the two decisions that actually change what happens to the
      // citizen's report get a notification — dismiss is a no-op from
      // their perspective (nothing about their report changed).
      if (action === 'quarantine') {
        await this.notifications.createInTx(tx, {
          recipientType: 'citizen',
          recipientId: updated.citizen_id,
          type: 'report_quarantined',
          title: 'Report under additional review',
          message: `"${updated.title}" needs another look before it appears on the public map. This does not affect your ticket's progress.`,
          href: `/dashboard/reports/${reportId}`,
          entityType: 'report',
          entityId: reportId,
        });
      } else if (action === 'duplicate') {
        await this.notifications.createInTx(tx, {
          recipientType: 'citizen',
          recipientId: updated.citizen_id,
          type: 'report_flagged_duplicate',
          title: 'Report matched an existing submission',
          message: `The photo on "${updated.title}" matched a report already on file, so it won't be shown separately.`,
          href: `/dashboard/reports/${reportId}`,
          entityType: 'report',
          entityId: reportId,
        });
      }

      return { status };
    });
  }
}
