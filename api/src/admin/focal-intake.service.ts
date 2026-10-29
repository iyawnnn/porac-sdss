import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import type { SeverityScreeningStatus } from '../db/schema';
import { isFocalPersonnel } from '../common/authz/admin-scope';
import { AdminAuditService } from './admin-audit.service';
import { TicketsService } from './tickets.service';
import { NotificationsService } from '../notifications/notifications.service';

// Central Monitoring / Focal Personnel's municipality-wide intake surface —
// a separate concept from the operational Ticket Queue (see
// api/src/admin/tickets.service.ts). Reads reports (not tickets) joined
// through to their ticket for routing/status/scoring context, and writes to
// report_acknowledgments/report_intake_actions and the report's own
// severity screening fields only — never tickets.status.

export type IntakeState =
  'New' | 'Acknowledged' | 'Screened' | 'Forwarded' | 'Escalated';
// 'screened' is history only since manuscript revision Phase 3, step 3f:
// old rows are kept, never written again, and never read for the intake
// state (severity screening replaced the general screening action).
export type IntakeActionType = 'screened' | 'forwarded' | 'escalated';
export const INTAKE_ACTION_TYPES: IntakeActionType[] = [
  'screened',
  'forwarded',
  'escalated',
];

// Focal severity screening (Appendix H REPORTS severity_screening_*,
// manuscript Table 2; manuscript revision Phase 3, step 3f). The two
// outcomes Focal can record; NOT_REVIEWED is only the starting value, never
// something a screening sets back.
export const SEVERITY_SCREENING_OUTCOMES = [
  'NO_CONCERN_NOTED',
  'REQUIRES_OPERATIONAL_VALIDATION',
] as const;
export type SeverityScreeningOutcome =
  (typeof SEVERITY_SCREENING_OUTCOMES)[number];
export const SEVERITY_SCREENING_REMARKS_MAX = 1000;

const ACTIVE_STATUSES = new Set(['Reported', 'Under Review', 'In Progress']);

export function validateSeverityScreening(input: {
  status: unknown;
  remarks: unknown;
}): { status: SeverityScreeningOutcome; remarks: string | null } {
  if (
    !SEVERITY_SCREENING_OUTCOMES.includes(
      input.status as SeverityScreeningOutcome,
    )
  ) {
    throw new BadRequestException(
      'status must be NO_CONCERN_NOTED or REQUIRES_OPERATIONAL_VALIDATION.',
    );
  }
  if (
    input.remarks !== undefined &&
    input.remarks !== null &&
    typeof input.remarks !== 'string'
  ) {
    throw new BadRequestException('remarks must be text.');
  }
  const remarks = (input.remarks ?? '').trim();
  if (remarks.length > SEVERITY_SCREENING_REMARKS_MAX) {
    throw new BadRequestException(
      `remarks must be at most ${SEVERITY_SCREENING_REMARKS_MAX} characters.`,
    );
  }
  return {
    status: input.status as SeverityScreeningOutcome,
    remarks: remarks || null,
  };
}

// Screening is allowed while the report's ticket is active and not merged
// away. Pure, so the action (409) and the detail's disabled form use the
// same rule and message.
export function severityScreeningBlock(ticket: {
  id: number;
  status: string;
  mergedIntoTicketId: number | null;
}): string | null {
  if (ticket.mergedIntoTicketId !== null) {
    return `Ticket #${ticket.id} was merged into Ticket #${ticket.mergedIntoTicketId} and is read-only.`;
  }
  if (!ACTIVE_STATUSES.has(ticket.status)) {
    return `Ticket #${ticket.id} is ${ticket.status}; a report can only be screened while its ticket is active.`;
  }
  return null;
}

// The Focal dashboard's "Needs Screening": a report not yet screened
// (NOT_REVIEWED) that can still be screened (its ticket active and not
// merged away). Acknowledgment plays no part: per the manuscript the two
// are parallel and neither is a prerequisite of the other.
export function needsSeverityScreening(report: {
  ticketId: number;
  ticketStatus: string;
  mergedIntoTicketId: number | null;
  severityScreeningStatus: SeverityScreeningStatus;
}): boolean {
  return (
    report.severityScreeningStatus === 'NOT_REVIEWED' &&
    severityScreeningBlock({
      id: report.ticketId,
      status: report.ticketStatus,
      mergedIntoTicketId: report.mergedIntoTicketId,
    }) === null
  );
}

// Presentation-only derivation, never persisted — this is exactly what
// keeps "New/Acknowledged/Screened/Forwarded/Escalated" from becoming a
// second TicketStatus (see schema.ts's reportIntakeActions docblock).
// The latest of the intake events wins over a bare acknowledgment, since
// screening/forwarding/escalating all imply the report was acknowledged
// along the way even if that row is somehow missing. The events are the
// latest forwarded/escalated intake action and, since manuscript revision
// Phase 3, step 3f, the severity screening (Screened means a status other
// than NOT_REVIEWED); an old 'screened' intake action counts for nothing.
// When both exist, the later one wins (the action on a tie).
export function deriveIntakeState(input: {
  acknowledgedAt: string | Date | null;
  latestActionType: string | null;
  latestActionAt?: string | Date | null;
  severityScreeningStatus?: SeverityScreeningStatus | null;
  severityScreenedAt?: string | Date | null;
}): IntakeState {
  const action =
    input.latestActionType === 'escalated'
      ? 'Escalated'
      : input.latestActionType === 'forwarded'
        ? 'Forwarded'
        : null;
  const screened =
    !!input.severityScreeningStatus &&
    input.severityScreeningStatus !== 'NOT_REVIEWED';
  if (action && screened) {
    const actionAt = input.latestActionAt
      ? new Date(input.latestActionAt).getTime()
      : 0;
    const screenedAt = input.severityScreenedAt
      ? new Date(input.severityScreenedAt).getTime()
      : 0;
    return screenedAt > actionAt ? 'Screened' : action;
  }
  if (action) return action;
  if (screened) return 'Screened';
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
  tracking_reference: string;
  ticket_id: number;
  category: string;
  ticket_status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  member_count: number;
  barangay_name: string;
  citizen_severity: string;
  submitted_at: string;
  flags: string[] | null;
  operational_priority: number | null;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  latest_action_type: string | null;
  latest_action_at: string | null;
  severity_screening_status: SeverityScreeningStatus;
  severity_screened_at: string | null;
  merged_into_ticket_id: number | null;
}

export interface FocalIntakeRow {
  reportId: number;
  // The stored Appendix H tracking reference (PRC-YYYY-NNNNNN) since
  // manuscript revision Phase 2, step 2b — was the computed "Report #<id>".
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
  // Canonical Focal-facing decision-support label (Step 29 of the Batch 2
  // design) — Operational Priority, never the raw column name verbatim.
  // The Hazard Urgency field that sat beside it was removed in manuscript
  // revision Phase 1, step 6b.
  operationalPriority: number | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  intakeState: IntakeState;
  // The Focal dashboard's "Needs Screening" (manuscript revision Phase 3,
  // step 3f): see needsSeverityScreening.
  needsScreening: boolean;
}

interface RawIntakeGeoRow {
  report_id: number;
  tracking_reference: string;
  category: string;
  barangay_name: string;
  assigned_office: 'MEO' | 'MDRRMO';
  operational_priority: number | null;
  acknowledged_at: string | null;
  latest_action_type: string | null;
  latest_action_at: string | null;
  severity_screening_status: SeverityScreeningStatus;
  severity_screened_at: string | null;
  lat: number;
  lng: number;
}

export interface FocalIntakeGeoRow {
  reportId: number;
  reportReference: string;
  category: string;
  barangayName: string;
  routedOffice: 'MEO' | 'MDRRMO';
  operationalPriority: number | null;
  lat: number;
  lng: number;
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
  linkedTicketReference: string;
  activity: IntakeActivityRow[];
  // Manuscript revision Phase 3, step 3e: lat/lng above are the citizen's
  // pin; these are the ticket's current location and the category the
  // citizen picked (category is the ticket's current one). Staff
  // corrections change only the ticket.
  ticketLat: number;
  ticketLng: number;
  submittedCategory: string;
  // Manuscript revision Phase 3, step 3f: the report's current severity
  // screening (Focal-only; citizens never see it). blockedReason is null
  // while Focal may screen, else why not (the same rule as the action).
  severityScreening: {
    status: SeverityScreeningStatus;
    remarks: string | null;
    screenedByName: string | null;
    screenedAt: string | null;
    blockedReason: string | null;
  };
}

// The intake-state inputs every Focal query selects (deriveIntakeState).
function intakeStateOf(row: {
  acknowledged_at: string | null;
  latest_action_type: string | null;
  latest_action_at: string | null;
  severity_screening_status: SeverityScreeningStatus;
  severity_screened_at: string | null;
}): IntakeState {
  return deriveIntakeState({
    acknowledgedAt: row.acknowledged_at,
    latestActionType: row.latest_action_type,
    latestActionAt: row.latest_action_at,
    severityScreeningStatus: row.severity_screening_status,
    severityScreenedAt: row.severity_screened_at,
  });
}

function mapRow(row: RawIntakeRow): FocalIntakeRow {
  return {
    reportId: row.report_id,
    reportReference: row.tracking_reference,
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
    operationalPriority: row.operational_priority,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByName: row.acknowledged_by_name,
    intakeState: intakeStateOf(row),
    needsScreening: needsSeverityScreening({
      ticketId: row.ticket_id,
      ticketStatus: row.ticket_status,
      mergedIntoTicketId: row.merged_into_ticket_id ?? null,
      severityScreeningStatus: row.severity_screening_status,
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
        r.id AS report_id, r.tracking_reference, t.id AS ticket_id, t.category, t.status AS ticket_status,
        t.assigned_office, t.member_count, b.name AS barangay_name, t.merged_into_ticket_id,
        r.citizen_severity, r.created_at AS submitted_at, r.flags,
        t.priority_index AS operational_priority,
        ra.acknowledged_at, ra.acknowledged_by_name,
        latest.action_type AS latest_action_type, latest.created_at AS latest_action_at,
        r.severity_screening_status, r.severity_screened_at
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id = r.id
      LEFT JOIN LATERAL (
        SELECT action_type, created_at FROM report_intake_actions
        WHERE report_id = r.id AND action_type IN ('forwarded', 'escalated')
        ORDER BY created_at DESC LIMIT 1
      ) latest ON true
      ORDER BY r.created_at DESC
    `;
    return rows.map(mapRow);
  }

  // Batch 4: a Focal-safe read-only map source — deliberately its own
  // narrow query, not a reuse of the operational GET /admin/tickets/geo
  // endpoint (which stays behind OperationalStaffGuard and is never
  // relaxed for Focal). Only intake-relevant fields: report reference,
  // category, barangay, coordinates, routed office, Operational Priority
  // (Hazard Urgency until manuscript revision Phase 1, step 6b), and
  // derived intake state — no Operational Assessment content, no Work
  // Order internals, no staff assignment, no mutation controls.
  async listIntakeGeo(): Promise<FocalIntakeGeoRow[]> {
    const sql = this.pg;
    const rows = await sql<RawIntakeGeoRow[]>`
      SELECT
        r.id AS report_id, r.tracking_reference, t.category, b.name AS barangay_name,
        t.assigned_office, t.priority_index AS operational_priority,
        ra.acknowledged_at, latest.action_type AS latest_action_type,
        latest.created_at AS latest_action_at, r.severity_screening_status, r.severity_screened_at,
        ST_Y(r.pin_geom) AS lat, ST_X(r.pin_geom) AS lng
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id = r.id
      LEFT JOIN LATERAL (
        SELECT action_type, created_at FROM report_intake_actions
        WHERE report_id = r.id AND action_type IN ('forwarded', 'escalated')
        ORDER BY created_at DESC LIMIT 1
      ) latest ON true
      ORDER BY r.created_at DESC
    `;
    return rows.map((row) => ({
      reportId: row.report_id,
      reportReference: row.tracking_reference,
      category: row.category,
      barangayName: row.barangay_name,
      routedOffice: row.assigned_office,
      operationalPriority: row.operational_priority,
      lat: row.lat,
      lng: row.lng,
      intakeState: intakeStateOf(row),
    }));
  }

  async getIntakeDetail(reportId: number): Promise<FocalIntakeDetail | null> {
    const sql = this.pg;
    const [row] = await sql<
      (RawIntakeRow & {
        description: string | null;
        lat: number;
        lng: number;
        ticket_lat: number;
        ticket_lng: number;
        submitted_category: string;
        severity_screening_remarks: string | null;
        severity_screened_by_name: string | null;
      })[]
    >`
      SELECT
        r.id AS report_id, r.tracking_reference, t.id AS ticket_id, t.category, t.status AS ticket_status,
        t.assigned_office, t.member_count, b.name AS barangay_name, t.merged_into_ticket_id,
        r.citizen_severity, r.created_at AS submitted_at, r.flags,
        r.description, ST_Y(r.pin_geom) AS lat, ST_X(r.pin_geom) AS lng,
        ST_Y(t.geom) AS ticket_lat, ST_X(t.geom) AS ticket_lng, r.submitted_category,
        t.priority_index AS operational_priority,
        ra.acknowledged_at, ra.acknowledged_by_name,
        latest.action_type AS latest_action_type, latest.created_at AS latest_action_at,
        r.severity_screening_status, r.severity_screening_remarks, r.severity_screened_at,
        (sa.first_name || ' ' || sa.last_name) AS severity_screened_by_name
      FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      JOIN barangays b ON b.id = t.barangay_id
      LEFT JOIN report_acknowledgments ra ON ra.report_id = r.id
      LEFT JOIN admins sa ON sa.id = r.severity_screened_by_admin_id
      LEFT JOIN LATERAL (
        SELECT action_type, created_at FROM report_intake_actions
        WHERE report_id = r.id AND action_type IN ('forwarded', 'escalated')
        ORDER BY created_at DESC LIMIT 1
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
      linkedTicketReference: `Ticket #${row.ticket_id}`,
      activity,
      ticketLat: row.ticket_lat,
      ticketLng: row.ticket_lng,
      submittedCategory: row.submitted_category,
      severityScreening: {
        status: row.severity_screening_status,
        remarks: row.severity_screening_remarks,
        screenedByName: row.severity_screened_by_name,
        screenedAt: row.severity_screened_at,
        blockedReason: severityScreeningBlock({
          id: row.ticket_id,
          status: row.ticket_status,
          mergedIntoTicketId: row.merged_into_ticket_id ?? null,
        }),
      },
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

        const trimmedRemarks = remarks?.trim() || null;
        await tx`
          INSERT INTO report_acknowledgments (report_id, acknowledged_by_admin_id, acknowledged_by_name, remarks)
          VALUES (${reportId}, ${admin.adminId}, ${admin.adminName}, ${trimmedRemarks})
        `;
        // Appendix H ticket-level acknowledgments (manuscript revision Phase
        // 2, step 2d): the first acknowledged report on a ticket creates its
        // row; later reports on the same ticket add nothing (ON CONFLICT).
        // Same transaction, so now() equals the report row's acknowledged_at.
        // Acknowledging the same report twice never reaches this insert — the
        // report_acknowledgments UNIQUE above raises first, which is the 409.
        // Every read stays on report_acknowledgments for now.
        await tx`
          INSERT INTO acknowledgments (ticket_id, acknowledged_by_admin_id, remarks, acknowledged_at)
          VALUES (${report.ticket_id}, ${admin.adminId}, ${trimmedRemarks}, now())
          ON CONFLICT (ticket_id) DO NOTHING
        `;

        await this.audit.logInPgTx(tx, {
          actor: {
            adminId: admin.adminId,
            adminName: admin.adminName,
            email: admin.email,
            accountType: admin.accountType,
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

  // Focal severity screening (manuscript revision Phase 3, step 3f;
  // Appendix H REPORTS severity_screening_*, Table 2). Replaces the old
  // general screening action, which wrote report_intake_actions
  // 'screened' rows (kept as history, never written again). Sets the four
  // fields on the report; re-screening overwrites them, and every screening
  // writes one report_severity_screened audit event. Advisory only: it
  // never writes citizen_severity or the ticket, and never recalculates
  // Operational Priority (the ticket's severity is the median of its
  // reports' citizen_severity, so it can't change either). FocalGuard
  // already limits the route to Focal Personnel; the check here keeps the
  // rule with the write. The report row is locked so the audit's oldStatus is the value
  // this screening replaced.
  async screenSeverity(
    reportId: number,
    admin: AdminSession,
    input: { status: unknown; remarks: unknown },
  ): Promise<FocalIntakeDetail | null> {
    if (!isFocalPersonnel(admin)) {
      throw new ForbiddenException('Focal Intake access required.');
    }
    const { status, remarks } = validateSeverityScreening(input);
    const sql = this.pg;
    await sql.begin(async (tx) => {
      const [report] = await tx<
        {
          id: number;
          title: string;
          severity_screening_status: SeverityScreeningStatus;
          ticket_id: number;
          ticket_status: string;
          merged_into_ticket_id: number | null;
        }[]
      >`
        SELECT r.id, r.title, r.severity_screening_status,
          t.id AS ticket_id, t.status AS ticket_status, t.merged_into_ticket_id
        FROM reports r
        JOIN tickets t ON t.id = r.ticket_id
        WHERE r.id = ${reportId}
        FOR UPDATE OF r
      `;
      if (!report) throw new NotFoundException('Report not found.');
      const blocked = severityScreeningBlock({
        id: report.ticket_id,
        status: report.ticket_status,
        mergedIntoTicketId: report.merged_into_ticket_id,
      });
      if (blocked) throw new ConflictException(blocked);

      await tx`
        UPDATE reports SET
          severity_screening_status = ${status},
          severity_screening_remarks = ${remarks},
          severity_screened_by_admin_id = ${admin.adminId},
          severity_screened_at = now()
        WHERE id = ${reportId}
      `;

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          accountType: admin.accountType,
          office: admin.office,
        },
        actionType: 'report_severity_screened',
        targetType: 'report',
        targetId: reportId,
        targetSummary: `${report.title} (Report #${reportId})`,
        metadata: {
          oldStatus: report.severity_screening_status,
          newStatus: status,
          remarks,
        },
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

  // Attention signal only — never touches Operational Priority,
  // ticket.status, or assigned_office (Step 15 of the Batch 2
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
        {
          id: number;
          title: string;
          ticket_id: number;
          tracking_reference: string;
        }[]
      >`
        SELECT id, title, ticket_id, tracking_reference FROM reports WHERE id = ${reportId}
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
          accountType: admin.accountType,
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
        // The tracking reference since the Phase 2, step 2b follow-up;
        // stored notifications keep "Report #<id>".
        message: `${report.title} (Report ${report.tracking_reference}) was escalated by Focal: ${reason.trim()}`,
        href: `/admin/tickets/${report.ticket_id}`,
        entityType: 'report',
        entityId: reportId,
      });
    });

    return this.getIntakeDetail(reportId);
  }
}
