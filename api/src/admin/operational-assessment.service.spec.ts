import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OperationalAssessmentService } from './operational-assessment.service';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import type { AdminAuditService } from './admin-audit.service';

const MEO_OFFICER = {
  adminId: 1,
  adminName: 'Juan Cruz',
  email: 'juan@meo.gov.ph',
  role: 'officer',
  office: 'MEO',
} as AdminSession;
const MEO_SUPERVISOR = {
  adminId: 2,
  adminName: 'Ana Reyes',
  email: 'ana@meo.gov.ph',
  role: 'supervisor',
  office: 'MEO',
} as AdminSession;
const MDRRMO_OFFICER = {
  adminId: 3,
  adminName: 'Mark Santos',
  email: 'mark@mdrrmo.gov.ph',
  role: 'officer',
  office: 'MDRRMO',
} as AdminSession;
const FOCAL = {
  adminId: 4,
  adminName: 'Diana Torres',
  email: 'diana@focal.gov.ph',
  role: 'focal',
  office: 'MDRRMO',
} as AdminSession;
const SYSTEM_ADMIN = {
  adminId: 5,
  adminName: 'MIS Admin',
  email: 'mis@porac.gov.ph',
  role: 'system_admin',
  office: null,
} as AdminSession;

const VALID_INPUT = {
  observedConditions: 'Road shoulder eroded, 2m gap exposed',
  safetyImplications: 'Risk of vehicle falling into the gap at night',
  operationalConstraints: ['equipment', 'funding'],
  recommendedAction: 'Deploy backfill crew with barricades',
  temporaryMitigation: 'Cones and warning signage placed',
  defermentReason: undefined,
  referralReason: undefined,
  remarks: undefined,
};

// Mirrors focal-intake.service.spec.ts's makeService convention: an ordered
// array of row-sets, one per query call in sequence, with sql.begin just
// invoking the callback against the same fake client.
function makeService(rows: unknown[][]) {
  let i = 0;
  const sql = ((..._args: unknown[]) => {
    return {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        const next = rows[i++] ?? [];
        if (next instanceof Error) {
          void Promise.reject(next).then(resolve, reject);
        } else {
          void Promise.resolve(next).then(resolve, reject);
        }
      },
    };
  }) as unknown as Sql;
  (
    sql as unknown as {
      begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
    }
  ).begin = (cb) => cb(sql);

  const logInPgTx = jest.fn().mockResolvedValue(undefined);
  const audit = { logInPgTx } as unknown as AdminAuditService;

  const service = new OperationalAssessmentService(sql, audit);
  return { service, logInPgTx, sql };
}

const ASSESSMENT_ROW = {
  id: 1,
  ticket_id: 10,
  assessed_by_admin_id: 1,
  assessed_by_name: 'Juan Cruz',
  observed_conditions: VALID_INPUT.observedConditions,
  safety_implications: VALID_INPUT.safetyImplications,
  operational_constraints: VALID_INPUT.operationalConstraints,
  recommended_action: VALID_INPUT.recommendedAction,
  temporary_mitigation: VALID_INPUT.temporaryMitigation,
  deferment_reason: null,
  referral_reason: null,
  remarks: null,
  assessed_at: '2026-01-01T00:00:00Z',
  updated_by_admin_id: 1,
  updated_by_name: 'Juan Cruz',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('OperationalAssessmentService.upsert — create', () => {
  it('404s when the ticket does not exist', async () => {
    const { service } = makeService([[]]);
    await expect(service.upsert(999, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('MEO officer can create an assessment on an MEO ticket', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO' }], // ticket lookup
      [{ inserted: true }], // INSERT ... ON CONFLICT (no conflict — first save)
      [ASSESSMENT_ROW], // getForTicket refetch
    ]);
    const result = await service.upsert(10, MEO_OFFICER, VALID_INPUT);
    expect(result?.observedConditions).toBe(VALID_INPUT.observedConditions);
    expect(logInPgTx).toHaveBeenCalledTimes(1);
    expect(logInPgTx.mock.calls[0][1].actionType).toBe(
      'operational_assessment_created',
    );
  });

  it('MEO supervisor can create an assessment on an MEO ticket', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await expect(
      service.upsert(10, MEO_SUPERVISOR, VALID_INPUT),
    ).resolves.toBeTruthy();
  });

  it('MDRRMO officer can create an assessment on an MDRRMO ticket', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MDRRMO' }],
      [{ inserted: true }],
      [{ ...ASSESSMENT_ROW, assessed_by_name: 'Mark Santos' }],
    ]);
    await expect(
      service.upsert(11, MDRRMO_OFFICER, VALID_INPUT),
    ).resolves.toBeTruthy();
  });

  it('stores the constraint array and actor snapshot correctly', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    const result = await service.upsert(10, MEO_OFFICER, VALID_INPUT);
    expect(result?.assessedByName).toBe('Juan Cruz');
    expect(result?.operationalConstraints).toEqual(['equipment', 'funding']);
  });

  it('one row per ticket — a single atomic INSERT ... ON CONFLICT, not a separate check-then-insert', async () => {
    let queryCount = 0;
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void) {
          queryCount++;
          const rows = [
            [{ assigned_office: 'MEO' }],
            [{ inserted: true }],
            [ASSESSMENT_ROW],
          ];
          void Promise.resolve(rows[queryCount - 1] ?? []).then(resolve);
        },
      };
    }) as unknown as Sql;
    (
      sql as unknown as {
        begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
      }
    ).begin = (cb) => cb(sql);
    const audit = {
      logInPgTx: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminAuditService;
    const service = new OperationalAssessmentService(sql, audit);
    await service.upsert(10, MEO_OFFICER, VALID_INPUT);
    // ticket lookup + one upsert statement + refetch — no separate
    // existence-check query (that's exactly the race window this hardening
    // pass removed).
    expect(queryCount).toBe(3);
  });
});

describe('OperationalAssessmentService.upsert — authorization', () => {
  it('rejects focal', async () => {
    const { service } = makeService([[{ assigned_office: 'MDRRMO' }]]);
    await expect(service.upsert(10, FOCAL, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects system_admin', async () => {
    const { service } = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(service.upsert(10, SYSTEM_ADMIN, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects MEO staff assessing an MDRRMO ticket', async () => {
    const { service } = makeService([[{ assigned_office: 'MDRRMO' }]]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects MDRRMO staff assessing an MEO ticket', async () => {
    const { service } = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(
      service.upsert(10, MDRRMO_OFFICER, VALID_INPUT),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('OperationalAssessmentService.upsert — update', () => {
  it('updates the existing assessment instead of inserting a duplicate', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO' }], // ticket lookup
      [{ inserted: false }], // INSERT ... ON CONFLICT lands as an update
      [{ ...ASSESSMENT_ROW, observed_conditions: 'Updated text' }], // refetch
    ]);
    const result = await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      observedConditions: 'Updated text',
    });
    expect(result?.observedConditions).toBe('Updated text');
    expect(logInPgTx.mock.calls[0][1].actionType).toBe(
      'operational_assessment_updated',
    );
  });

  it('re-checks authorization on edit, not just on create', async () => {
    const { service } = makeService([[{ assigned_office: 'MDRRMO' }]]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('OperationalAssessmentService.upsert — office-transfer (reassignment) case', () => {
  it('the original office can no longer edit after the ticket moves to the other office', async () => {
    // ticket.assigned_office now reflects the CURRENT (post-reassignment)
    // owner — the service always re-reads it fresh, never trusts a stale
    // caller-supplied office.
    const { service } = makeService([[{ assigned_office: 'MDRRMO' }]]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('the new owning office can edit the existing assessment after reassignment', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MDRRMO' }], // ticket now owned by MDRRMO
      [{ inserted: false }], // assessment created earlier by MEO still exists
      [{ ...ASSESSMENT_ROW, updated_by_name: 'Mark Santos' }],
    ]);
    await expect(
      service.upsert(10, MDRRMO_OFFICER, VALID_INPUT),
    ).resolves.toBeTruthy();
    expect(logInPgTx.mock.calls[0][1].actionType).toBe(
      'operational_assessment_updated',
    );
  });
});

describe('OperationalAssessmentService.upsert — concurrent first-save race', () => {
  // Two authorized MEO staff both attempt the FIRST assessment save on the
  // same ticket at nearly the same instant. A single atomic
  // INSERT ... ON CONFLICT (ticket_id) DO UPDATE means Postgres itself
  // resolves the race: whichever write reaches the table second is applied
  // as the UPDATE branch of that same statement — there is no window where
  // a second INSERT is attempted and no raw 23505 ever reaches the caller.
  // (Prior to this hardening pass, a separate "SELECT existing -> if absent
  // -> INSERT" shape let both transactions observe no row and both attempt
  // an INSERT, and the loser hit UNIQUE(ticket_id) as an uncaught error —
  // see the regression this test now locks in.)
  it('the losing racer of a concurrent first save does not receive a raw unique-violation error', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO' }], // ticket lookup
      [{ inserted: false }], // this racer's write lands as the UPDATE branch
      [
        {
          ...ASSESSMENT_ROW,
          assessed_by_name: 'Juan Cruz',
          updated_by_name: 'Ana Reyes',
        },
      ], // refetch
    ]);
    const result = await service.upsert(10, MEO_SUPERVISOR, VALID_INPUT);
    expect(result).toBeTruthy();
    // The losing racer's write must be recorded as an update, never a
    // second "created" event for the same ticket.
    expect(logInPgTx.mock.calls[0][1].actionType).toBe(
      'operational_assessment_updated',
    );
    // The original assessor (the winner, Juan Cruz) must still be on
    // record — the losing racer (Ana Reyes) becomes latest editor only.
    expect(result?.assessedByName).toBe('Juan Cruz');
    expect(result?.updatedByName).toBe('Ana Reyes');
  });

  it('the winning racer of a concurrent first save is recorded as the creator', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: true }], // this racer's INSERT actually landed
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, VALID_INPUT);
    expect(logInPgTx.mock.calls[0][1].actionType).toBe(
      'operational_assessment_created',
    );
  });

  it('never overwrites assessed_by_admin_id/assessed_by_name/assessed_at on conflict — the DO UPDATE SET clause omits all three', () => {
    const source = readFileSync(
      join(__dirname, 'operational-assessment.service.ts'),
      'utf8',
    );
    const onConflictMatch = source.match(/DO UPDATE SET[\s\S]*?RETURNING/i);
    expect(onConflictMatch).not.toBeNull();
    const setClause = onConflictMatch?.[0] ?? '';
    expect(setClause).not.toMatch(/assessed_by_admin_id\s*=/);
    expect(setClause).not.toMatch(/assessed_by_name\s*=/);
    expect(setClause).not.toMatch(/(?<!_)\bassessed_at\s*=/);
  });
});

describe('OperationalAssessmentService.upsert — status untouched', () => {
  it('create never references tickets.status', () => {
    const source = readFileSync(
      join(__dirname, 'operational-assessment.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/UPDATE\s+tickets/i);
    expect(source).not.toMatch(/\.advanceStatus\(/);
  });
});

describe('OperationalAssessmentService.upsert — no score', () => {
  it('the assessment row shape has no score/level/band/priority field', () => {
    const keys = Object.keys(ASSESSMENT_ROW);
    for (const forbidden of ['score', 'level', 'band', 'priority']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});

describe('OperationalAssessmentService.upsert — validation', () => {
  it('rejects an invalid operational constraint value', async () => {
    const { service } = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        operationalConstraints: ['not_a_real_constraint'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a fully blank assessment', async () => {
    const { service } = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        observedConditions: '   ',
        safetyImplications: '',
        operationalConstraints: [],
        recommendedAction: '',
        temporaryMitigation: '',
        defermentReason: undefined,
        referralReason: undefined,
        remarks: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a payload where only a subset of fields is filled in', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        observedConditions: 'Just this one field filled in',
        safetyImplications: '',
        operationalConstraints: [],
        recommendedAction: '',
        temporaryMitigation: '',
        defermentReason: undefined,
        referralReason: undefined,
        remarks: undefined,
      }),
    ).resolves.toBeTruthy();
  });
});

describe('OperationalAssessmentService.getForTicket', () => {
  it('returns null when no assessment exists', async () => {
    const { service } = makeService([[]]);
    const result = await service.getForTicket(10);
    expect(result).toBeNull();
  });

  it('returns the mapped assessment when one exists', async () => {
    const { service } = makeService([[ASSESSMENT_ROW]]);
    const result = await service.getForTicket(10);
    expect(result?.recommendedAction).toBe(VALID_INPUT.recommendedAction);
    expect(result?.operationalConstraints).toEqual(
      VALID_INPUT.operationalConstraints,
    );
  });
});
