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
import { assertResponsibleOfficeCanAct } from './work-order.rules';
import {
  OPERATIONAL_CONSTRAINTS,
  OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
  OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH,
  OPERATIONAL_ASSESSMENT_REMARKS_MAX_LENGTH,
  OPERATIONAL_ASSESSMENT_EVIDENCE_URL_MAX_LENGTH,
  OPERATIONAL_CONSTRAINT_NOTE_MAX_LENGTH,
  type OperationalConstraint,
} from '../contracts/schemas';

// MEO/MDRRMO's human Operational Assessment (Batch 3) — the third decision-
// support layer, deliberately separate from the system-generated Operational
// Priority (tickets.priority_index — never read nor written here). The
// other former system score, Hazard Urgency, was retired in manuscript
// revision Phase 1.
// ONE CURRENT row per ticket (operational_assessments.ticket_id UNIQUE);
// see schema.ts's own docblock for the two-actor-snapshot rationale and why
// there is deliberately no score/level/band column anywhere in this table.
//
// Authorization (manuscript revision Phase 5, step 5b, shared with Work
// Orders in work-order.rules.ts): MEO / MDRRMO Personnel of the ticket's
// CURRENT office only, including after a reassignment (the ticket row is
// read fresh and locked inside the transaction); never Focal Personnel or
// the System Administrator; never on a merged-away or Rejected ticket.
//
// Step 5b also added actual_action, supporting_evidence_url and
// constraint notes (Appendix H), and made assessed conditions
// required on every new save. Rows saved earlier with blank assessed
// conditions stay as they are and stay readable; editing one means filling
// it in. A ticket's Work Orders can be created only once it has an
// assessment with assessed conditions (WorkOrdersService.create).

export interface OperationalAssessmentInput {
  assessedConditions?: string;
  safetyImplications?: string;
  operationalConstraints?: string[];
  recommendedAction?: string;
  interimMitigation?: string;
  defermentOrReferralReason?: string;
  remarks?: string;
  actualAction?: string;
  supportingEvidenceUrl?: string | null;
  operationalConstraintNotes?: unknown;
}

export interface OperationalAssessmentRow {
  id: number;
  ticketId: number;
  assessedByAdminId: number;
  assessedByName: string | null;
  assessedConditions: string;
  safetyImplications: string;
  operationalConstraints: string[];
  recommendedAction: string;
  interimMitigation: string;
  defermentOrReferralReason: string | null;
  remarks: string | null;
  createdAt: string;
  updatedByAdminId: number | null;
  updatedByName: string | null;
  updatedAt: string;
  actualAction: string | null;
  supportingEvidenceUrl: string | null;
  operationalConstraintNotes: Record<string, string>;
}

interface RawAssessmentRow {
  id: number;
  ticket_id: number;
  assessed_by_admin_id: number;
  assessed_by_name: string | null;
  assessed_conditions: string;
  safety_implications: string;
  operational_constraints: {
    selected: string[];
    notes: Record<string, string>;
  };
  recommended_action: string;
  interim_mitigation: string;
  deferment_or_referral_reason: string | null;
  remarks: string | null;
  created_at: string;
  updated_by_admin_id: number | null;
  updated_by_name: string | null;
  updated_at: string;
  actual_action: string | null;
  supporting_evidence_url: string | null;
}

function mapRow(row: RawAssessmentRow): OperationalAssessmentRow {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    assessedByAdminId: row.assessed_by_admin_id,
    assessedByName: row.assessed_by_name,
    assessedConditions: row.assessed_conditions,
    safetyImplications: row.safety_implications,
    operationalConstraints: row.operational_constraints.selected,
    operationalConstraintNotes: row.operational_constraints.notes,
    recommendedAction: row.recommended_action,
    interimMitigation: row.interim_mitigation,
    defermentOrReferralReason: row.deferment_or_referral_reason,
    remarks: row.remarks,
    createdAt: row.created_at,
    updatedByAdminId: row.updated_by_admin_id,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
    actualAction: row.actual_action,
    supportingEvidenceUrl: row.supporting_evidence_url,
  };
}

interface NormalizedInput {
  assessedConditions: string;
  safetyImplications: string;
  operationalConstraints: OperationalConstraint[];
  recommendedAction: string;
  interimMitigation: string;
  defermentOrReferralReason: string | null;
  remarks: string | null;
  actualAction: string | null;
  supportingEvidenceUrl: string | null;
  operationalConstraintNotes: Partial<Record<OperationalConstraint, string>>;
}

const URL_MESSAGE =
  'Supporting evidence URL must be a full http:// or https:// address.';

function normalizeEvidenceUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(URL_MESSAGE);
  const trimmed = value.trim();
  // Blank is stored as NULL, never '' (operational_assessments_evidence_url_check).
  if (!trimmed) return null;
  if (trimmed.length > OPERATIONAL_ASSESSMENT_EVIDENCE_URL_MAX_LENGTH) {
    throw new BadRequestException(
      `Supporting evidence URL must be at most ${OPERATIONAL_ASSESSMENT_EVIDENCE_URL_MAX_LENGTH} characters`,
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException(URL_MESSAGE);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(URL_MESSAGE);
  }
  return trimmed;
}

// { constraintKey: note } — the keys are the same 12 OPERATIONAL_CONSTRAINTS
// as the checkboxes, and a note belongs to a selected constraint. Blank
// notes are dropped rather than stored.
function normalizeConstraintNotes(
  value: unknown,
  selected: OperationalConstraint[],
): Partial<Record<OperationalConstraint, string>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(
      'Operational constraint notes must be an object keyed by constraint.',
    );
  }
  const notes: Partial<Record<OperationalConstraint, string>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!OPERATIONAL_CONSTRAINTS.includes(key as OperationalConstraint)) {
      throw new BadRequestException(
        `Invalid operational constraint note: ${key}`,
      );
    }
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') {
      throw new BadRequestException(`The note for ${key} must be text.`);
    }
    const note = raw.trim();
    if (!note) continue;
    if (note.length > OPERATIONAL_CONSTRAINT_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `The note for ${key} must be at most ${OPERATIONAL_CONSTRAINT_NOTE_MAX_LENGTH} characters`,
      );
    }
    if (!selected.includes(key as OperationalConstraint)) {
      throw new BadRequestException(
        `A note was given for ${key}, which is not selected as an operational constraint.`,
      );
    }
    notes[key as OperationalConstraint] = note;
  }
  return notes;
}

function normalizeAndValidate(
  input: OperationalAssessmentInput,
): NormalizedInput {
  const constraints = input.operationalConstraints ?? [];
  if (!Array.isArray(constraints)) {
    throw new BadRequestException('Operational constraints must be an array.');
  }
  for (const c of constraints) {
    if (!OPERATIONAL_CONSTRAINTS.includes(c as OperationalConstraint)) {
      throw new BadRequestException(`Invalid operational constraint: ${c}`);
    }
  }

  const text = (v: unknown, max: number, label: string) => {
    if (v != null && typeof v !== 'string') {
      throw new BadRequestException(`${label} must be text.`);
    }
    const trimmed = (v ?? '').trim();
    if (trimmed.length > max) {
      throw new BadRequestException(
        `${label} must be at most ${max} characters`,
      );
    }
    return trimmed;
  };
  const nullableText = (v: unknown, max: number, label: string) => {
    const trimmed = text(v, max, label);
    return trimmed || null;
  };

  const normalized: NormalizedInput = {
    assessedConditions: text(
      input.assessedConditions,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Assessed conditions',
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
    interimMitigation: text(
      input.interimMitigation,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Interim mitigation',
    ),
    defermentOrReferralReason: nullableText(
      input.defermentOrReferralReason,
      OPERATIONAL_ASSESSMENT_REASON_MAX_LENGTH,
      'Deferment or referral reason',
    ),
    remarks: nullableText(
      input.remarks,
      OPERATIONAL_ASSESSMENT_REMARKS_MAX_LENGTH,
      'Remarks',
    ),
    actualAction: nullableText(
      input.actualAction,
      OPERATIONAL_ASSESSMENT_TEXT_MAX_LENGTH,
      'Actual action',
    ),
    supportingEvidenceUrl: normalizeEvidenceUrl(input.supportingEvidenceUrl),
    operationalConstraintNotes: normalizeConstraintNotes(
      input.operationalConstraintNotes,
      constraints as OperationalConstraint[],
    ),
  };

  // Appendix H's assessed_conditions is NOT NULL: every new save needs
  // assessed conditions (manuscript revision Phase 5, step 5b). This also
  // rules out the fully blank record the earlier "at least one field" rule
  // refused. Older rows saved with blank assessed conditions stay valid.
  if (!normalized.assessedConditions) {
    throw new BadRequestException('Assessed conditions are required.');
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
        assessed_conditions, safety_implications, operational_constraints,
        recommended_action, interim_mitigation, deferment_or_referral_reason,
        remarks, created_at,
        updated_by_admin_id, updated_by_name, updated_at,
        actual_action, supporting_evidence_url
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
  // Critically, assessed_by_admin_id/assessed_by_name/created_at are NOT
  // in the DO UPDATE SET list below — on conflict they keep the values from
  // the row already in the table (the original creator's), never the
  // conflicting INSERT's values, so the original assessor can never be
  // silently overwritten by a later racer or editor.
  //
  // Step 5b: the ticket row is read and locked inside the same transaction
  // (a concurrent Reject, Merge or Reassign waits), and the INSERT selects
  // from the ticket only while it is still not merged away and not
  // Rejected, so neither can slip in between the checks and the write.
  async upsert(
    ticketId: number,
    admin: AdminSession,
    input: OperationalAssessmentInput,
  ): Promise<OperationalAssessmentRow | null> {
    const sql = this.pg;

    await sql.begin(async (tx) => {
      const [ticket] = await tx<
        {
          status: string;
          assigned_office: 'MEO' | 'MDRRMO';
          merged_into_ticket_id: number | null;
        }[]
      >`
        SELECT status, assigned_office, merged_into_ticket_id
        FROM tickets WHERE id = ${ticketId}
        FOR UPDATE
      `;
      if (!ticket) throw new NotFoundException('Ticket not found');
      assertResponsibleOfficeCanAct(
        admin,
        { id: ticketId, ...ticket },
        'Operational Assessment',
      );

      const normalized = normalizeAndValidate(input);

      const [written] = await tx<{ inserted: boolean }[]>`
        INSERT INTO operational_assessments (
          ticket_id, assessed_by_admin_id, assessed_by_name,
          assessed_conditions, safety_implications, operational_constraints,
          recommended_action, interim_mitigation, deferment_or_referral_reason,
          remarks, updated_by_admin_id, updated_by_name,
          actual_action, supporting_evidence_url
        )
        SELECT
          t.id, ${admin.adminId}, ${admin.adminName},
          ${normalized.assessedConditions}, ${normalized.safetyImplications}, ${JSON.stringify({ selected: normalized.operationalConstraints, notes: normalized.operationalConstraintNotes })}::jsonb,
          ${normalized.recommendedAction}, ${normalized.interimMitigation}, ${normalized.defermentOrReferralReason}, ${normalized.remarks}, ${admin.adminId}, ${admin.adminName},
          ${normalized.actualAction}, ${normalized.supportingEvidenceUrl}
        FROM tickets t
        WHERE t.id = ${ticketId}
          AND t.merged_into_ticket_id IS NULL
          AND t.status <> 'Rejected'
        ON CONFLICT (ticket_id) DO UPDATE SET
          assessed_conditions = EXCLUDED.assessed_conditions,
          safety_implications = EXCLUDED.safety_implications,
          operational_constraints = EXCLUDED.operational_constraints,
          recommended_action = EXCLUDED.recommended_action,
          interim_mitigation = EXCLUDED.interim_mitigation,
          deferment_or_referral_reason = EXCLUDED.deferment_or_referral_reason,
          remarks = EXCLUDED.remarks,
          actual_action = EXCLUDED.actual_action,
          supporting_evidence_url = EXCLUDED.supporting_evidence_url,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_by_name = EXCLUDED.updated_by_name,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `;
      if (!written) {
        throw new ConflictException(
          `Ticket #${ticketId} changed while the assessment was being saved; reload and try again.`,
        );
      }

      await this.audit.logInPgTx(tx, {
        actor: {
          adminId: admin.adminId,
          adminName: admin.adminName,
          email: admin.email,
          accountType: admin.accountType,
          office: admin.office,
        },
        actionType: written.inserted
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
