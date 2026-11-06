import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import { isFocalPersonnel } from '../common/authz/admin-scope';
import {
  deriveIntakeState,
  needsSeverityScreening,
} from './focal-intake.service';
import type { SeverityScreeningStatus } from '../db/schema';

export function parseFocalPage(page?: string, pageSize?: string) {
  const parse = (value: string | undefined, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    ) {
      throw new BadRequestException(
        'Paging values must be positive integers within the allowed maximum.',
      );
    }
    return Number(value);
  };
  return { page: parse(page, 1, 1_000_000), pageSize: parse(pageSize, 6, 50) };
}

interface DashboardReport {
  report_id: number;
  report_reference: string;
  ticket_id: number;
  category: string;
  ticket_status: string;
  barangay_name: string;
  routed_office: 'MEO' | 'MDRRMO';
  operational_priority: number | null;
  submitted_at: string;
  acknowledged_at: string | null;
  severity_screening_status: SeverityScreeningStatus;
  severity_screened_at: string | null;
  latest_action_type: string | null;
  latest_action_at: string | null;
}

// Municipality-wide report intake only. Operational views keep their guards
// and office scope. This service never reads Work Orders or their internals.
@Injectable()
export class FocalDashboardService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  private authorize(admin: AdminSession) {
    if (!isFocalPersonnel(admin))
      throw new ForbiddenException('Focal access required.');
  }

  private facts() {
    return this.pg`
      SELECT r.id AS report_id,r.tracking_reference AS report_reference,t.id AS ticket_id,
        t.category,t.status AS ticket_status,b.name AS barangay_name,t.assigned_office AS routed_office,
        t.priority_index AS operational_priority,r.created_at AS submitted_at,
        ra.acknowledged_at,r.severity_screening_status,r.severity_screened_at,
        latest.action_type AS latest_action_type,latest.created_at AS latest_action_at
      FROM reports r JOIN tickets t ON t.id=r.ticket_id JOIN barangays b ON b.id=t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id=r.id
      LEFT JOIN LATERAL (
        SELECT action_type,created_at FROM report_intake_actions
        WHERE report_id=r.id AND action_type IN ('forwarded','escalated')
        ORDER BY created_at DESC,id DESC LIMIT 1
      ) latest ON true
      WHERE t.merged_into_ticket_id IS NULL
    `;
  }

  async counts(admin: AdminSession) {
    this.authorize(admin);
    const facts = this.facts();
    const [row] = await this.pg<
      {
        newReports: number;
        unacknowledged: number;
        needsScreening: number;
        forwardedOrEscalated: number;
        medianAcknowledgmentHours30d: number | null;
      }[]
    >`
      WITH facts AS (${facts})
      SELECT count(*)::int AS "newReports",
        count(*) FILTER (WHERE acknowledged_at IS NULL AND severity_screening_status='NOT_REVIEWED'
          AND latest_action_type IS NULL)::int AS "unacknowledged",
        count(*) FILTER (WHERE severity_screening_status='NOT_REVIEWED'
          AND ticket_status IN ('Reported','Under Review','In Progress'))::int AS "needsScreening",
        count(*) FILTER (WHERE latest_action_type IS NOT NULL AND (severity_screening_status='NOT_REVIEWED'
          OR COALESCE(latest_action_at,to_timestamp(0)) >= COALESCE(severity_screened_at,to_timestamp(0))))::int AS "forwardedOrEscalated",
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (acknowledged_at-submitted_at))/3600)
          FILTER (WHERE acknowledged_at >= now()-interval '30 days' AND acknowledged_at <= now()))::float8 AS "medianAcknowledgmentHours30d"
      FROM facts
    `;
    return row;
  }

  async reports(admin: AdminSession, pageParam?: string, sizeParam?: string) {
    this.authorize(admin);
    const { page, pageSize } = parseFocalPage(pageParam, sizeParam);
    const facts = this.facts();
    // One statement retains the total on empty pages and uses one snapshot.
    const [result] = await this.pg<
      { total: number; items: DashboardReport[] }[]
    >`
      WITH facts AS (${facts}), paged AS (
        SELECT * FROM facts ORDER BY submitted_at DESC,report_id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      )
      SELECT (SELECT count(*)::int FROM facts) AS total,
        COALESCE((SELECT jsonb_agg(p ORDER BY p.submitted_at DESC,p.report_id DESC) FROM paged p),'[]'::jsonb) AS items
    `;
    return {
      total: result.total,
      page,
      pageSize,
      items: result.items.map((r) => ({
        reportId: r.report_id,
        reportReference: r.report_reference,
        category: r.category,
        barangayName: r.barangay_name,
        routedOffice: r.routed_office,
        operationalPriority: r.operational_priority,
        submittedAt: r.submitted_at,
        intakeState: deriveIntakeState({
          acknowledgedAt: r.acknowledged_at,
          latestActionType: r.latest_action_type,
          latestActionAt: r.latest_action_at,
          severityScreeningStatus: r.severity_screening_status,
          severityScreenedAt: r.severity_screened_at,
        }),
        needsScreening: needsSeverityScreening({
          ticketId: r.ticket_id,
          ticketStatus: r.ticket_status,
          mergedIntoTicketId: null,
          severityScreeningStatus: r.severity_screening_status,
        }),
      })),
    };
  }
}
