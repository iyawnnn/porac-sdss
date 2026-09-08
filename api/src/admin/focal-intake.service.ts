import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import { AdminAuditService } from './admin-audit.service';
import { TicketsService } from './tickets.service';
import { NotificationsService } from '../notifications/notifications.service';

// Central Monitoring / Focal Personnel's municipality-wide intake surface —
// a separate concept from the operational Ticket Queue (see
// api/src/admin/tickets.service.ts). Reads reports (not tickets) joined
// through to their ticket for routing/status/scoring context, and writes to
// report_acknowledgments/report_intake_actions only — never tickets.status.

export type IntakeState =
  'New' | 'Acknowledged' | 'Screened' | 'Forwarded' | 'Escalated';
export type IntakeActionType = 'screened' | 'forwarded' | 'escalated';
export const INTAKE_ACTION_TYPES: IntakeActionType[] = [
  'screened',
  'forwarded',
  'escalated',
];
export type ScreeningRecommendation = 'continue' | 'forward' | 'escalate';
export const SCREENING_RECOMMENDATIONS: ScreeningRecommendation[] = [
  'continue',
  'forward',
  'escalate',
];

// Presentation-only derivation, never persisted — this is exactly what
// keeps "New/Acknowledged/Screened/Forwarded/Escalated" from becoming a
// second TicketStatus (see schema.ts's reportIntakeActions docblock).
// Ordering: the latest intake action (if any) always wins over a bare
// acknowledgment, since screening/forwarding/escalating all imply the
// report was acknowledged along the way even if that row is somehow
// missing; escalated/forwarded outrank screened as more specific outcomes.
export function deriveIntakeState(input: {
  acknowledgedAt: string | Date | null;
  latestActionType: string | null;
}): IntakeState {
  if (input.latestActionType === 'escalated') return 'Escalated';
  if (input.latestActionType === 'forwarded') return 'Forwarded';
  if (input.latestActionType === 'screened') return 'Screened';
  if (input.acknowledgedAt) return 'Acknowledged';
  return 'New';
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

interface RawIntakeRow {
  report_id: number;
  ticket_id: number;
  category: string;
  ticket_status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  member_count: number;
  barangay_name: string;
  citizen_severity: string;
  submitted_at: string;
  flags: string[] | null;
  hazard_urgency_index: number | null;
  hazard_urgency_level: string | null;
  operational_priority: number | null;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  latest_action_type: string | null;
}

export interface FocalIntakeRow {
  reportId: number;
  reportReference: string;
  ticketId: number;
  ticketReference: string;
  category: string;
  ticketStatus: string;
  routedOffice: 'MEO' | 'MDRRMO';
  memberCount: number;
  barangayName: string;
  citizenSeverity: string;
  submittedAt: string;
  flags: string[];
  // Canonical Focal-facing decision-support labels (Step 29 of the Batch 2
  // design) — never "priority_score"/"priority_index" verbatim, and never
  // merged into one value.
  hazardUrgency: { index: number | null; level: string | null };
  operationalPriority: number | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  intakeState: IntakeState;
}

export interface IntakeActivityRow {
  actionType: string;
  actorName: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface FocalIntakeDetail extends FocalIntakeRow {
  description: string | null;
  lat: number;
  lng: number;
  elevationM: number | null;
  linkedTicketReference: string;
  activity: IntakeActivityRow[];
}

function mapRow(row: RawIntakeRow): FocalIntakeRow {
  return {
    reportId: row.report_id,
    reportReference: `Report #${row.report_id}`,
    ticketId: row.ticket_id,
    ticketReference: `Ticket #${row.ticket_id}`,
    category: row.category,
    ticketStatus: row.ticket_status,
    routedOffice: row.assigned_office,
    memberCount: row.member_count,
    barangayName: row.barangay_name,
    citizenSeverity: row.citizen_severity,
    submittedAt: row.submitted_at,
    flags: row.flags ?? [],
    hazardUrgency: {
      index: row.hazard_urgency_index,
      level: row.hazard_urgency_level,
    },
    operationalPriority: row.operational_priority,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByName: row.acknowledged_by_name,
    intakeState: deriveIntakeState({
      acknowledgedAt: row.acknowledged_at,
      latestActionType: row.latest_action_type,
    }),
  };
}

@Injectable()
export class FocalIntakeService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly tickets: TicketsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  // Municipality-wide: deliberately no office filter/param — Focal sees
  // every report routed to MEO or MDRRMO, which is the entire reason this
  // is a dedicated intake surface rather than an all-office adaptation of
  // the operational Ticket Queue (see TicketsService.parseTicketQuery,
  // which is always office-scoped and stays that way).
  async listIntake(): Promise<FocalIntakeRow[]> {
    const sql = this.pg;
    const rows = await sql<RawIntakeRow[]>`
      SELECT
        r.id AS report_id, t.id AS ticket_id, t.category, t.status AS ticket_status,
        t.assigned_office, t.member_count, b.name AS barangay_name,
        r.citizen_severity, r.created_at AS submitted_at, r.flags,
        t.priority_score AS hazard_urgency_index, t.urgency_level AS hazard_urgency_level,
        t.priority_index AS operational_priority,
        ra.acknowledged_at, ra.acknowledged_by_name,
        latest.action_type AS latest_action_type
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id = r.id
      LEFT JOIN LATERAL (
        SELECT action_type FROM report_intake_actions
        WHERE report_id = r.id ORDER BY created_at DESC LIMIT 1
      ) latest ON true
      ORDER BY r.created_at DESC
    `;
    return rows.map(mapRow);
  }

  async getIntakeDetail(reportId: number): Promise<FocalIntakeDetail | null> {
    const sql = this.pg;
    const [row] = await sql<
      (RawIntakeRow & {
        description: string | null;
        lat: number;
        lng: number;
        elevation_m: number | null;
      })[]
    >`
      SELECT
        r.id AS report_id, t.id AS ticket_id, t.category, t.status AS ticket_status,
        t.assigned_office, t.member_count, b.name AS barangay_name,
        r.citizen_severity, r.created_at AS submitted_at, r.flags,
        r.description, ST_Y(r.pin_geom) AS lat, ST_X(r.pin_geom) AS lng, r.elevation_m,
        t.priority_score AS hazard_urgency_index, t.urgency_level AS hazard_urgency_level,
        t.priority_index AS operational_priority,
        ra.acknowledged_at, ra.acknowledged_by_name,
        latest.action_type AS latest_action_type
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id = r.id
      LEFT JOIN LATERAL (
        SELECT action_type FROM report_intake_actions
        WHERE report_id = r.id ORDER BY created_at DESC LIMIT 1
      ) latest ON true
      WHERE r.id = ${reportId}
    `;
    if (!row) return null;

    const activity = await sql<IntakeActivityRow[]>`
      SELECT action_type AS "actionType", actor_name AS "actorName", remarks, created_at AS "createdAt"
      FROM report_intake_actions WHERE report_id = ${reportId} ORDER BY created_at ASC
    `;

    return {
      ...mapRow(row),
      description: row.description,
      lat: row.lat,
      lng: row.lng,
      elevationM: row.elevation_m,
      linkedTicketReference: `Ticket #${row.ticket_id}`,
      activity,
    };
  }

  // Report-level, once-only — the report_acknowledgments.report_id UNIQUE
  // constraint is the actual enforcement (concurrency-safe, not a
  // check-then-insert race); this maps the resulting violation to a 409.
  async acknowledge(
    reportId: number,
    admin: AdminSession,
    remarks: string | undefined,
  ): Promise<FocalIntakeDetail | null> {
    const sql = this.pg;
    try {
      await sql.begin(async (tx) => {
        const [report] = await tx<
          { id: number; citizen_id: number; ticket_id: number; title: string }[]
        >`
          SELECT id, citizen_id, ticket_id, title FROM reports WHERE id = ${reportId}
        `;
        if (!report) throw new NotFoundException('Report not found.');

        await tx`
          INSERT INTO report_acknowledgments (report_id, acknowledged_by_admin_id, acknowledged_by_name, remarks)
          VALUES (${reportId}, ${admin.adminId}, ${admin.adminName}, ${remarks?.trim() || null})
        `;

        await this.audit.logInPgTx(tx, {
          actor: {
            adminId: admin.adminId,
            adminName: admin.adminName,
            email: admin.email,
            role: admin.role,
            office: admin.office,
          },
          actionType: 'report_acknowledged',
          targetType: 'report',
          targetId: reportId,
          targetSummary: `${report.title} (Report #${reportId})`,
        });

        await this.notifications.createInTx(tx, {
          recipientType: 'citizen',
          recipientId: report.citizen_id,
          type: 'report_acknowledged',
          title: 'Report acknowledged',
          message: 'Your report has been acknowledged by municipal monitoring.',
          href: `/dashboard/reports/${reportId}`,
          entityType: 'ticket',
          entityId: report.ticket_id,
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'This report has already been acknowledged.',
        );
      }
      throw err;
    }

    return this.getIntakeDetail(reportId);
  }

  // Records only the recommendation — never executes Forward/Escalate
  // itself. Those remain the authoritative, separately-called endpoints
  // (Step 13 of the Batch 2 design: "screening recommendation ≠ executed
  // Forward/Escalate action").
  async screen(
    reportId: number,
    admin: AdminSession,
    input: { remarks?: string; recommendedHandling: ScreeningRecommendation },
  ): Promise<FocalIntakeDetail | null> {
    if (!SCREENING_RECOMMENDATIONS.includes(input.recommendedHandling)) {
      throw new BadRequestException(
        'recommendedHandling must be continue, forward, or escalate.',
      );
    }
    const sql = this.pg;
    await sql.begin(async (tx) => {
      const [report] = await tx<{ id: number; title: string }[]>`
        SELECT id, title FROM reports WHERE id = ${reportId}
      `;
      if (!report) throw new NotFoundException('Report not found.');

      await tx`
        INSERT INTO report_intake_actions (report_id, action_type, actor_admin_id, actor_name, remarks)
        VALUES (${reportId}, 'screened', ${admin.adminId}, ${admin.adminName}, ${input.remarks?.trim() || null})
      `;

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: 'report_screened',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `${report.title} (Report #${reportId})`,
        metadata: { recommendedHandling: input.recommendedHandling },
      });
    });

    return this.getIntakeDetail(reportId);
  }

  // Reuses TicketsService.reassignOffice as the single source of truth for
  // office-custody changes (Step 14 of the Batch 2 design) — its own
  // authorization branch for role: 'focal' enforces the early-intake safety
  // rule (Reported + no active work order). This method only adds the
  // report-level intake-action record on top of that.
  async forward(
    reportId: number,
    admin: AdminSession,
    toOffice: 'MEO' | 'MDRRMO',
    reason: string,
  ): Promise<FocalIntakeDetail | null> {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required.');
    }
    const sql = this.pg;
    const [report] = await sql<{ id: number; ticket_id: number }[]>`
      SELECT id, ticket_id FROM reports WHERE id = ${reportId}
    `;
    if (!report) throw new NotFoundException('Report not found.');

    await this.tickets.reassignOffice(report.ticket_id, admin, toOffice);

    await sql`
      INSERT INTO report_intake_actions (report_id, action_type, actor_admin_id, actor_name, remarks)
      VALUES (${reportId}, 'forwarded', ${admin.adminId}, ${admin.adminName}, ${reason.trim()})
    `;

    return this.getIntakeDetail(reportId);
  }

  // Attention signal only — never touches Hazard Urgency, Operational
  // Priority, ticket.status, or assigned_office (Step 15 of the Batch 2
  // design). Notifies the ticket's CURRENT office, not a fixed one, since
  // Forward may already have moved it before Escalate is called.
  async escalate(
    reportId: number,
    admin: AdminSession,
    reason: string,
  ): Promise<FocalIntakeDetail | null> {
    if (!reason?.trim()) {
      throw new BadRequestException('An escalation reason is required.');
    }
    const sql = this.pg;
    await sql.begin(async (tx) => {
      const [report] = await tx<
        { id: number; title: string; ticket_id: number }[]
      >`
        SELECT id, title, ticket_id FROM reports WHERE id = ${reportId}
      `;
      if (!report) throw new NotFoundException('Report not found.');

      const [ticket] = await tx<{ assigned_office: 'MEO' | 'MDRRMO' }[]>`
        SELECT assigned_office FROM tickets WHERE id = ${report.ticket_id}
      `;

      await tx`
        INSERT INTO report_intake_actions (report_id, action_type, actor_admin_id, actor_name, remarks)
        VALUES (${reportId}, 'escalated', ${admin.adminId}, ${admin.adminName}, ${reason.trim()})
      `;

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: 'report_escalated',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `${report.title} (Report #${reportId})`,
      });

      await this.notifications.createInTx(tx, {
        recipientType: 'admin',
        recipientOffice: ticket.assigned_office,
        type: 'report_escalated',
        title: 'Report escalated for priority attention',
        message: `${report.title} (Report #${reportId}) was escalated by Focal: ${reason.trim()}`,
        href: `/admin/tickets/${report.ticket_id}`,
        entityType: 'report',
        entityId: reportId,
      });
    });

    return this.getIntakeDetail(reportId);
  }
}
