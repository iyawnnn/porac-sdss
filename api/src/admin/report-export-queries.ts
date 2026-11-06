import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql as dsql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import { DB, PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import { resolveOfficeScope } from '../common/authz/admin-scope';
import { ALL_CATEGORIES } from '../contracts/schemas';
import { TICKET_STATUSES } from './ticket-constants';
import { auditDateBounds } from './admin-audit.service';
import { EXPORT_ROW_LIMIT, assertExportLimit } from './export-limit';
import {
  hazardSummary,
  type CurrentHazardRow,
} from '../common/utils/hazard-information';

type Query = Record<string, string | undefined>;
export type ExportFilters = {
  office: 'MEO' | 'MDRRMO';
  status: string;
  category?: string;
  barangayId?: number;
  from?: string;
  to?: string;
  since?: string;
  until?: string;
};

export function parseReportExportFilters(
  query: Query,
  admin: AdminSession,
  barangay = false,
): ExportFilters {
  const office = resolveOfficeScope(admin, undefined);
  const status = query.status || 'all';
  if (!['all', 'active', ...TICKET_STATUSES].includes(status))
    throw new BadRequestException('Choose a valid ticket status.');
  const category = query.category || undefined;
  if (category && !(ALL_CATEGORIES as readonly string[]).includes(category))
    throw new BadRequestException('Choose a valid category.');
  let barangayId: number | undefined;
  if (barangay && query.barangayId) {
    if (
      !/^[1-9]\d*$/.test(query.barangayId) ||
      Number(query.barangayId) > 2147483647
    )
      throw new BadRequestException('Barangay must be a positive integer.');
    barangayId = Number(query.barangayId);
  }
  const from = query.dateFrom || undefined;
  const to = query.dateTo || undefined;
  const bounds = auditDateBounds(from, to);
  return {
    office,
    status,
    category,
    barangayId,
    from,
    to,
    since: bounds.from,
    until: bounds.until,
  };
}

export function parseExportTop(value: string | undefined): number {
  if (value === undefined) return 20;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 200)
    throw new BadRequestException('Top N must be an integer from 1 to 200.');
  return Number(value);
}

type TicketRow = {
  ticket_id: number;
  assigned_office: string;
  category: string;
  status: string;
  priority_index: number;
  resolution_outcome: string | null;
  resolved_at: string | null;
};
export type SubmittedExportRow = TicketRow & {
  tracking_reference: string;
  submitted_category: string;
  barangay_name: string;
  citizen_severity: string;
  flags: string[];
  severity_screening_status: string;
  moderation_status: string | null;
  created_at: string;
};
export type AssessmentExportRow = TicketRow & {
  assessed_at: string;
  assessed_by_name: string | null;
  observed_conditions: string;
  safety_implications: string;
  operational_constraints: string[];
  operational_constraint_notes: Record<string, string>;
  recommended_action: string;
  temporary_mitigation: string;
  deferment_reason: string | null;
  referral_reason: string | null;
  remarks: string | null;
  actual_action: string | null;
  supporting_evidence_url: string | null;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
};
export type PriorityExportRow = TicketRow & {
  barangay_name: string;
  member_count: number;
  created_at: string;
  updated_at: string;
  hazard_summary: string;
};

@Injectable()
export class ReportExportQueries {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    @Inject(PG) private readonly pg: Sql,
  ) {}

  async submitted(filters: ExportFilters): Promise<SubmittedExportRow[]> {
    const f = filters;
    const rows = await this.db.execute<SubmittedExportRow>(dsql`
      SELECT r.tracking_reference, t.id AS ticket_id, t.status, t.assigned_office,
        t.category, r.submitted_category, b.name AS barangay_name, r.citizen_severity,
        r.flags, r.severity_screening_status, r.moderation_status, r.created_at::text
      FROM reports r JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      WHERE t.assigned_office = ${f.office}::office AND t.merged_into_ticket_id IS NULL
        AND (${f.status} = 'all' OR (${f.status} = 'active' AND t.status IN ('Reported','Under Review','In Progress')) OR t.status::text = ${f.status})
        AND (${f.category ?? null}::text IS NULL OR t.category = ${f.category ?? null})
        AND (${f.barangayId ?? null}::int IS NULL OR t.barangay_id = ${f.barangayId ?? null})
        AND (${f.since ?? null}::timestamptz IS NULL OR r.created_at >= ${f.since ?? null}::timestamptz)
        AND (${f.until ?? null}::timestamptz IS NULL OR r.created_at < ${f.until ?? null}::timestamptz)
      ORDER BY r.created_at DESC, r.id DESC LIMIT ${EXPORT_ROW_LIMIT + 1}
    `);
    assertExportLimit(rows);
    return [...rows];
  }

  async assessments(filters: ExportFilters): Promise<AssessmentExportRow[]> {
    const f = filters;
    // UNIQUE(ticket_id) gives one current assessment, not assessment history.
    // Aggregate Work Orders separately to keep one row per assessed ticket.
    const rows = await this.db.execute<AssessmentExportRow>(dsql`
      SELECT t.id AS ticket_id, t.assigned_office, t.category, t.status, t.priority_index,
        t.resolution_outcome, t.resolved_at::text, a.assessed_at::text, a.assessed_by_name,
        a.observed_conditions, a.safety_implications, a.operational_constraints,
        a.operational_constraint_notes, a.recommended_action, a.temporary_mitigation,
        a.deferment_reason, a.referral_reason, a.remarks, a.actual_action, a.supporting_evidence_url,
        (SELECT count(*)::int FROM work_orders w WHERE w.ticket_id=t.id AND w.status='pending') AS pending,
        (SELECT count(*)::int FROM work_orders w WHERE w.ticket_id=t.id AND w.status='in_progress') AS in_progress,
        (SELECT count(*)::int FROM work_orders w WHERE w.ticket_id=t.id AND w.status='completed') AS completed,
        (SELECT count(*)::int FROM work_orders w WHERE w.ticket_id=t.id AND w.status='cancelled') AS cancelled
      FROM operational_assessments a JOIN tickets t ON t.id=a.ticket_id
      WHERE t.assigned_office = ${f.office}::office AND t.merged_into_ticket_id IS NULL
        AND (${f.status} = 'all' OR (${f.status} = 'active' AND t.status IN ('Reported','Under Review','In Progress')) OR t.status::text = ${f.status})
        AND (${f.category ?? null}::text IS NULL OR t.category = ${f.category ?? null})
        AND (${f.since ?? null}::timestamptz IS NULL OR a.assessed_at >= ${f.since ?? null}::timestamptz)
        AND (${f.until ?? null}::timestamptz IS NULL OR a.assessed_at < ${f.until ?? null}::timestamptz)
      ORDER BY a.assessed_at DESC, t.id DESC LIMIT ${EXPORT_ROW_LIMIT + 1}
    `);
    assertExportLimit(rows);
    return [...rows];
  }

  async priority(
    office: 'MEO' | 'MDRRMO',
    top: number,
  ): Promise<PriorityExportRow[]> {
    const sql = this.pg;
    // Geometry participates only in the existing current-location hazard
    // lookup, so this query uses PG. No geometry leaves the query.
    const rows = await sql<
      (Omit<PriorityExportRow, 'hazard_summary'> & {
        hazard_current: CurrentHazardRow | null;
      })[]
    >`
      SELECT t.id AS ticket_id, t.status, t.assigned_office, t.priority_index, t.category,
        b.name AS barangay_name, t.member_count, t.created_at::text, t.updated_at::text,
        (SELECT json_build_object('hazard_context_type',h.hazard_context_type,
          'lookup_status',h.lookup_status,'susceptibility_code',h.susceptibility_code,
          'susceptibility_label',h.susceptibility_label)
         FROM hazard_information h WHERE h.ticket_id=t.id AND h.superseded_at IS NULL
           AND ST_Equals(h.query_geom,t.geom) ORDER BY h.looked_up_at DESC,h.id DESC LIMIT 1) AS hazard_current
      FROM tickets t JOIN barangays b ON b.id=t.barangay_id
      WHERE t.assigned_office = ${office}::office AND t.merged_into_ticket_id IS NULL
        AND t.status IN ('Reported','Under Review','In Progress')
      ORDER BY t.priority_index DESC, t.created_at ASC, t.id ASC LIMIT ${top}
    `;
    return rows.map(({ hazard_current, ...row }) => ({
      ...row,
      hazard_summary: hazardSummary(row.category, hazard_current),
    }));
  }
}
