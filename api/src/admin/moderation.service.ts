import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

export type ModerationAction = 'dismiss' | 'quarantine' | 'duplicate';

export interface ModerationQueueRow {
  id: number;
  ticket_id: number;
  title: string;
  citizen_severity: string;
  image_url: string;
  flags: string[];
  location_mismatch_m: number | null;
  exif_captured_at: string | null;
  created_at: string;
  category: string;
  barangay_name: string;
  citizen_id: number;
  citizen_name: string;
  citizen_report_count: number;
  citizen_flag_count: number;
}

export interface ModerationStats {
  pending: number;
  quarantined: number;
  dismissed: number;
  avgResolutionHours: number | null;
}

@Injectable()
export class ModerationService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  async getModerationQueue(): Promise<ModerationQueueRow[]> {
    const sql = this.pg;
    return sql<ModerationQueueRow[]>`
      SELECT
        r.id, r.ticket_id, r.title, r.citizen_severity, r.image_url, r.flags,
        r.location_mismatch_m, r.exif_captured_at, r.created_at,
        t.category, b.name AS barangay_name,
        c.id AS citizen_id, (c.first_name || ' ' || c.last_name) AS citizen_name,
        (SELECT COUNT(*) FROM reports r2 WHERE r2.citizen_id = r.citizen_id)::int AS citizen_report_count,
        (SELECT COUNT(*) FROM reports r3 WHERE r3.citizen_id = r.citizen_id
          AND r3.flags IS NOT NULL AND array_length(r3.flags, 1) > 0)::int AS citizen_flag_count
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      JOIN citizens c ON c.id = r.citizen_id
      WHERE r.flags IS NOT NULL AND array_length(r.flags, 1) > 0
        AND r.moderation_status IS NULL
      ORDER BY r.created_at DESC
    `;
  }

  async getModerationStats(): Promise<ModerationStats> {
    const sql = this.pg;
    const [row] = await sql<
      { pending: string; quarantined: string; dismissed: string; avg_hours: number | null }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE moderation_status IS NULL) AS pending,
        COUNT(*) FILTER (WHERE moderation_status = 'quarantined') AS quarantined,
        COUNT(*) FILTER (WHERE moderation_status IN ('dismissed', 'duplicate')) AS dismissed,
        AVG(EXTRACT(EPOCH FROM (moderated_at - created_at)) / 3600)
          FILTER (WHERE moderated_at IS NOT NULL) AS avg_hours
      FROM reports
      WHERE flags IS NOT NULL AND array_length(flags, 1) > 0
    `;
    return {
      pending: Number(row?.pending ?? 0),
      quarantined: Number(row?.quarantined ?? 0),
      dismissed: Number(row?.dismissed ?? 0),
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
    adminName: string,
    canonicalReportId?: number,
  ): Promise<{ status: string }> {
    const sql = this.pg;

    if (action === 'duplicate') {
      if (!canonicalReportId) throw new BadRequestException('canonicalReportId is required');
      const [canonical] = await sql<{ id: number }[]>`SELECT id FROM reports WHERE id = ${canonicalReportId}`;
      if (!canonical) throw new BadRequestException('Canonical report not found');
    }

    const status = action === 'dismiss' ? 'dismissed' : action === 'quarantine' ? 'quarantined' : 'duplicate';
    const note = action === 'duplicate' ? String(canonicalReportId) : null;

    return sql.begin(async (tx) => {
      const [updated] = await tx<{ ticket_id: number }[]>`
        UPDATE reports
        SET moderation_status = ${status}, moderation_note = ${note},
          moderated_at = now(), moderated_by = ${adminName}
        WHERE id = ${reportId} AND moderation_status IS NULL
        RETURNING ticket_id
      `;

      if (!updated) {
        const [existing] = await tx<{ moderation_status: string | null }[]>`
          SELECT moderation_status FROM reports WHERE id = ${reportId}
        `;
        if (!existing) throw new NotFoundException('Report not found');
        throw new BadRequestException(`Report was already ${existing.moderation_status}`);
      }

      if (action === 'quarantine') {
        await tx`UPDATE tickets SET flagged = true, updated_at = now() WHERE id = ${updated.ticket_id}`;
      }

      return { status };
    });
  }
}
