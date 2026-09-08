import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import type { AdminSession } from '../auth/session.service';
import { assertOfficeAccess } from '../common/authz/admin-scope';
import { AdminAuditService } from './admin-audit.service';
import {
  OPERATIONAL_CONSTRAINTS,
  OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
  OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH,
  OPERATIONAL_ASSESSMENT_REMARKS_MAX_LENGTH,
  type OperationalConstraint,
} from '../contracts/schemas';

// MEO/MDRRMO's human Operational Assessment (Batch 3) — the third decision-
// support layer, deliberately separate from the two system-generated ones
// (Hazard Urgency = tickets.priority_score/urgency_level, Operational
// Priority = tickets.priority_index — neither read nor written here).
// ONE CURRENT row per ticket (operational_assessments.ticket_id UNIQUE);
// see schema.ts's own docblock for the two-actor-snapshot rationale and why
// there is deliberately no score/level/band column anywhere in this table.
//
// Authorization reuses assertOfficeAccess exactly as every other ticket-
// scoped write does (reassignOffice, advanceStatus, logReferral, ...) —
// no new permission framework: isOperationalStaff + admin.office ===
// ticket.assigned_office is already the correct rule for "officer/
// supervisor of the ticket's CURRENT office only," including after a
// reassignment (the ticket lookup below always reads the office fresh).

export interface OperationalAssessmentInput {
  observedConditions?: string;
  safetyImplications?: string;
  operationalConstraints?: string[];
  recommendedAction?: string;
  temporaryMitigation?: string;
  defermentReason?: string;
  referralReason?: string;
  remarks?: string;
}

export interface OperationalAssessmentRow {
  id: number;
  ticketId: number;
  assessedByAdminId: number | null;
  assessedByName: string | null;
  observedConditions: string;
  safetyImplications: string;
  operationalConstraints: string[];
  recommendedAction: string;
  temporaryMitigation: string;
  defermentReason: string | null;
  referralReason: string | null;
  remarks: string | null;
  assessedAt: string;
  updatedByAdminId: number | null;
  updatedByName: string | null;
  updatedAt: string;
}

interface RawAssessmentRow {
  id: number;
  ticket_id: number;
  assessed_by_admin_id: number | null;
  assessed_by_name: string | null;
  observed_conditions: string;
  safety_implications: string;
  operational_constraints: string[] | null;
  recommended_action: string;
  temporary_mitigation: string;
  deferment_reason: string | null;
  referral_reason: string | null;
  remarks: string | null;
  assessed_at: string;
  updated_by_admin_id: number | null;
  updated_by_name: string | null;
  updated_at: string;
}

function mapRow(row: RawAssessmentRow): OperationalAssessmentRow {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    assessedByAdminId: row.assessed_by_admin_id,
    assessedByName: row.assessed_by_name,
    observedConditions: row.observed_conditions,
    safetyImplications: row.safety_implications,
    operationalConstraints: row.operational_constraints ?? [],
    recommendedAction: row.recommended_action,
    temporaryMitigation: row.temporary_mitigation,
    defermentReason: row.deferment_reason,
    referralReason: row.referral_reason,
    remarks: row.remarks,
    assessedAt: row.assessed_at,
    updatedByAdminId: row.updated_by_admin_id,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

interface NormalizedInput {
  observedConditions: string;
  safetyImplications: string;
  operationalConstraints: OperationalConstraint[];
  recommendedAction: string;
  temporaryMitigation: string;
  defermentReason: string | null;
  referralReason: string | null;
  remarks: string | null;
}

function normalizeAndValidate(
  input: OperationalAssessmentInput,
): NormalizedInput {
  const constraints = input.operationalConstraints ?? [];
  for (const c of constraints) {
    if (!OPERATIONAL_CONSTRAINTS.includes(c as OperationalConstraint)) {
      throw new BadRequestException(`Invalid operational constraint: ${c}`);
    }
  }

  const text = (v: string | undefined, max: number, label: string) => {
    const trimmed = (v ?? '').trim();
    if (trimmed.length > max) {
      throw new BadRequestException(
        `${label} must be at most ${max} characters`,
      );
    }
    return trimmed;
  };
  const nullableText = (v: string | undefined, max: number, label: string) => {
    const trimmed = text(v, max, label);
    return trimmed || null;
  };

  const normalized: NormalizedInput = {
    observedConditions: text(
      input.observedConditions,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Observed conditions',
    ),
    safetyImplications: text(
      input.safetyImplications,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Safety implications',
    ),
    operationalConstraints: constraints as OperationalConstraint[],
    recommendedAction: text(
      input.recommendedAction,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Recommended action',
    ),
    temporaryMitigation: text(
      input.temporaryMitigation,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Temporary mitigation',
    ),
    defermentReason: nullableText(
      input.defermentReason,
      OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH,
      'Deferment reason',
    ),
    referralReason: nullableText(
      input.referralReason,
      OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH,
      'Referral reason',
    ),
    remarks: nullableText(
      input.remarks,
      OPERATIONAL_ASSESSMENT_REMARKS_MAX_LENGTH,
      'Remarks',
    ),
  };

  // A fully blank record documents nothing — reject rather than persist a
  // silent no-op row. This is the smallest rule that prevents an empty
  // assessment while still allowing a partial one (see §16 of the Batch 3
  // design: "do not require every field merely to force completion").
  const allBlank =
    !normalized.observedConditions &&
    !normalized.safetyImplications &&
    !normalized.recommendedAction &&
    !normalized.temporaryMitigation &&
    !normalized.defermentReason &&
    !normalized.referralReason &&
    !normalized.remarks &&
    normalized.operationalConstraints.length === 0;
  if (allBlank) {
    throw new BadRequestException('At least one assessment field is required.');
  }

  return normalized;
}

@Injectable()
export class OperationalAssessmentService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly audit: AdminAuditService,
  ) {}

  async getForTicket(
    ticketId: number,
  ): Promise<OperationalAssessmentRow | null> {
    const sql = this.pg;
    const [row] = await sql<RawAssessmentRow[]>`
      SELECT id, ticket_id, assessed_by_admin_id, assessed_by_name,
        observed_conditions, safety_implications, operational_constraints,
        recommended_action, temporary_mitigation, deferment_reason,
        referral_reason, remarks, assessed_at,
        updated_by_admin_id, updated_by_name, updated_at
      FROM operational_assessments WHERE ticket_id = ${ticketId}
    `;
    return row ? mapRow(row) : null;
  }

  // First save creates the one current row; every later save updates it in
  // place — never a second row for the same ticket. A single atomic
  // INSERT ... ON CONFLICT (ticket_id) DO UPDATE replaces a naive "SELECT
  // existing -> if absent -> INSERT" (hardening pass, post-Batch-3): two
  // authorized staff racing the FIRST save on the same ticket used to be
  // able to both observe no row and both attempt an INSERT, and the loser
  // would hit UNIQUE(ticket_id) as a raw, uncaught 23505 error. Postgres
  // now resolves that race itself — the loser's write lands as the UPDATE
  // branch of the same statement, atomically, with no window for a second
  // INSERT to ever be attempted. `RETURNING (xmax = 0) AS inserted` is the
  // standard Postgres idiom for telling which branch fired (xmax = 0 means
  // this command inserted the row; a nonzero xmax means it updated an
  // existing one), which is what picks the correct audit action type.
  // Critically, assessed_by_admin_id/assessed_by_name/assessed_at are NOT
  // in the DO UPDATE SET list below — on conflict they keep the values from
  // the row already in the table (the original creator's), never the
  // conflicting INSERT's values, so the original assessor can never be
  // silently overwritten by a later racer or editor.
  async upsert(
    ticketId: number,
    admin: AdminSession,
    input: OperationalAssessmentInput,
  ): Promise<OperationalAssessmentRow | null> {
    const sql = this.pg;
    const [ticket] = await sql<{ assigned_office: 'MEO' | 'MDRRMO' }[]>`
      SELECT assigned_office FROM tickets WHERE id = ${ticketId}
    `;
    if (!ticket) throw new NotFoundException('Ticket not found');
    assertOfficeAccess(admin, ticket.assigned_office);

    const normalized = normalizeAndValidate(input);

    await sql.begin(async (tx) => {
      const [{ inserted }] = await tx<{ inserted: boolean }[]>`
        INSERT INTO operational_assessments (
          ticket_id, assessed_by_admin_id, assessed_by_name,
          observed_conditions, safety_implications, operational_constraints,
          recommended_action, temporary_mitigation, deferment_reason,
          referral_reason, remarks, updated_by_admin_id, updated_by_name
        ) VALUES (
          ${ticketId}, ${admin.adminId}, ${admin.adminName},
          ${normalized.observedConditions}, ${normalized.safetyImplications}, ${normalized.operationalConstraints},
          ${normalized.recommendedAction}, ${normalized.temporaryMitigation}, ${normalized.defermentReason},
          ${normalized.referralReason}, ${normalized.remarks}, ${admin.adminId}, ${admin.adminName}
        )
        ON CONFLICT (ticket_id) DO UPDATE SET
          observed_conditions = EXCLUDED.observed_conditions,
          safety_implications = EXCLUDED.safety_implications,
          operational_constraints = EXCLUDED.operational_constraints,
          recommended_action = EXCLUDED.recommended_action,
          temporary_mitigation = EXCLUDED.temporary_mitigation,
          deferment_reason = EXCLUDED.deferment_reason,
          referral_reason = EXCLUDED.referral_reason,
          remarks = EXCLUDED.remarks,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_by_name = EXCLUDED.updated_by_name,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `;

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          role: admin.role,
          office: admin.office,
        },
        actionType: inserted
          ? 'operational_assessment_created'
          : 'operational_assessment_updated',
        targetType: 'ticket',
        targetId: ticketId,
        targetSummary: `Ticket #${ticketId}`,
      });
    });

    return this.getForTicket(ticketId);
  }
}
