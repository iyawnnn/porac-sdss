import {
  BadRequestException,
  ConflictException,
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
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
} as AdminSession;
const MEO_SUPERVISOR = {
  adminId: 2,
  adminName: 'Ana Reyes',
  email: 'ana@meo.gov.ph',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
} as AdminSession;
const MDRRMO_OFFICER = {
  adminId: 3,
  adminName: 'Mark Santos',
  email: 'mark@mdrrmo.gov.ph',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
} as AdminSession;
const FOCAL = {
  adminId: 4,
  adminName: 'Diana Torres',
  email: 'diana@focal.gov.ph',
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
} as AdminSession;
const SYSTEM_ADMIN = {
  adminId: 5,
  adminName: 'MIS Admin',
  email: 'mis@porac.gov.ph',
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
} as AdminSession;

const VALID_INPUT = {
  assessedConditions: 'Road shoulder eroded, 2m gap exposed',
  safetyImplications: 'Risk of vehicle falling into the gap at night',
  operationalConstraints: ['equipment', 'funding'],
  recommendedAction: 'Deploy backfill crew with barricades',
  interimMitigation: 'Cones and warning signage placed',
  defermentOrReferralReason: undefined,
  remarks: undefined,
};

// Mirrors focal-intake.service.spec.ts's makeService convention: an ordered
// array of row-sets, one per query call in sequence, with sql.begin just
// invoking the callback against the same fake client.
// Every query's SQL text and parameters, in order. A JS Date parameter is
// refused (the Phase 4c rule: timestamps go as ISO strings ::timestamptz).
const queries: { text: string; values: unknown[] }[] = [];

function makeService(rows: unknown[][]) {
  let i = 0;
  queries.length = 0;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (values.some((v) => v instanceof Date)) {
      throw new Error('JS Date passed to the database');
    }
    queries.push({ text: Array.from(strings).join('$'), values });
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
  assessed_conditions: VALID_INPUT.assessedConditions,
  safety_implications: VALID_INPUT.safetyImplications,
  operational_constraints: {
    selected: VALID_INPUT.operationalConstraints,
    notes: {},
  },
  recommended_action: VALID_INPUT.recommendedAction,
  interim_mitigation: VALID_INPUT.interimMitigation,
  deferment_or_referral_reason: null,
  remarks: null,
  created_at: '2026-01-01T00:00:00Z',
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
    expect(result?.assessedConditions).toBe(VALID_INPUT.assessedConditions);
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
      [{ ...ASSESSMENT_ROW, assessed_conditions: 'Updated text' }], // refetch
    ]);
    const result = await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      assessedConditions: 'Updated text',
    });
    expect(result?.assessedConditions).toBe('Updated text');
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

  it('never overwrites assessed_by_admin_id/assessed_by_name/created_at on conflict — the DO UPDATE SET clause omits all three', () => {
    const source = readFileSync(
      join(__dirname, 'operational-assessment.service.ts'),
      'utf8',
    );
    const onConflictMatch = source.match(/DO UPDATE SET[\s\S]*?RETURNING/i);
    expect(onConflictMatch).not.toBeNull();
    const setClause = onConflictMatch?.[0] ?? '';
    expect(setClause).not.toMatch(/assessed_by_admin_id\s*=/);
    expect(setClause).not.toMatch(/assessed_by_name\s*=/);
    expect(setClause).not.toMatch(/(?<!_)\bcreated_at\s*=/);
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
  it('rejects non-text assessedConditions before touching the database', async () => {
    const { service } = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        assessedConditions: 5 as unknown as string,
      }),
    ).rejects.toThrow('Assessed conditions must be text.');
    expect(queries).toHaveLength(1);
  });

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
        assessedConditions: '   ',
        safetyImplications: '',
        operationalConstraints: [],
        recommendedAction: '',
        interimMitigation: '',
        defermentOrReferralReason: undefined,
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
        assessedConditions: 'Just this one field filled in',
        safetyImplications: '',
        operationalConstraints: [],
        recommendedAction: '',
        interimMitigation: '',
        defermentOrReferralReason: undefined,
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

// Manuscript revision Phase 5, step 5b.
describe('OperationalAssessmentService.upsert — step 5b rules', () => {
  const ticket = (overrides: Record<string, unknown> = {}) => [
    {
      status: 'Under Review',
      assigned_office: 'MEO',
      merged_into_ticket_id: null,
      ...overrides,
    },
  ];

  it('404s when the ticket does not exist, before any write', async () => {
    const { service, logInPgTx } = makeService([[]]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      NotFoundException,
    );
    expect(queries).toHaveLength(1);
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('refuses a Rejected ticket with 409, before any write', async () => {
    const { service, logInPgTx } = makeService([
      ticket({ status: 'Rejected' }),
    ]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      new ConflictException(
        'Ticket #10 is Rejected; its Operational Assessment can no longer be changed.',
      ),
    );
    expect(queries).toHaveLength(1);
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('refuses a merged-away ticket with 409, before any write', async () => {
    const { service } = makeService([ticket({ merged_into_ticket_id: 12 })]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      new ConflictException(
        'Ticket #10 was merged into Ticket #12 and is read-only.',
      ),
    );
    expect(queries).toHaveLength(1);
  });

  it('checks the office before the Rejected/merged state (403 first)', async () => {
    const { service } = makeService([
      ticket({ assigned_office: 'MDRRMO', status: 'Rejected' }),
    ]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('locks the ticket row and writes only while it is not merged away and not Rejected', async () => {
    const { service } = makeService([
      ticket(),
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, VALID_INPUT);
    expect(queries[0].text).toMatch(/FROM tickets WHERE id = \$\s+FOR UPDATE/);
    expect(queries[1].text).toMatch(
      /FROM tickets t\s+WHERE t\.id = \$\s+AND t\.merged_into_ticket_id IS NULL\s+AND t\.status <> 'Rejected'/,
    );
  });

  it('409s when the guarded insert writes no row (the ticket changed underneath)', async () => {
    const { service, logInPgTx } = makeService([ticket(), []]);
    await expect(service.upsert(10, MEO_OFFICER, VALID_INPUT)).rejects.toThrow(
      ConflictException,
    );
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it.each([
    ['blank', '   '],
    ['missing', undefined],
  ])(
    'refuses %s assessed conditions on a new save, even with every other field filled',
    async (_label, assessedConditions) => {
      const { service } = makeService([ticket()]);
      await expect(
        service.upsert(10, MEO_OFFICER, {
          ...VALID_INPUT,
          assessedConditions,
          actualAction: 'Patched',
          remarks: 'Something',
        }),
      ).rejects.toThrow(
        new BadRequestException('Assessed conditions are required.'),
      );
      expect(queries).toHaveLength(1);
    },
  );

  it('stores actual action, evidence URL and constraint notes; notes go as a JSON string cast to jsonb', async () => {
    const { service } = makeService([
      ticket(),
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      actualAction: '  Cold patch applied  ',
      supportingEvidenceUrl: ' https://res.cloudinary.com/demo/site.jpg ',
      operationalConstraintNotes: {
        equipment: ' Backhoe under repair ',
        funding: '',
      },
    });
    const insert = queries[1];
    expect(insert.text).toMatch(/\$::jsonb/);
    expect(insert.values).toEqual(
      expect.arrayContaining([
        'Cold patch applied',
        'https://res.cloudinary.com/demo/site.jpg',
        JSON.stringify({
          selected: VALID_INPUT.operationalConstraints,
          notes: { equipment: 'Backhoe under repair' },
        }),
      ]),
    );
    // DO UPDATE carries the new columns too, so an edit changes them.
    expect(insert.text).toMatch(/actual_action = EXCLUDED\.actual_action/);
    expect(insert.text).toMatch(
      /supporting_evidence_url = EXCLUDED\.supporting_evidence_url/,
    );
    expect(insert.text).toMatch(
      /operational_constraints = EXCLUDED\.operational_constraints/,
    );
  });

  it('stores a blank evidence URL and blank actual action as NULL (never empty strings) and no notes as {}', async () => {
    const { service } = makeService([
      ticket(),
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      actualAction: '   ',
      supportingEvidenceUrl: '   ',
    });
    const values = queries[1].values;
    expect(values).not.toContain('');
    expect(values).toContain(
      JSON.stringify({
        selected: VALID_INPUT.operationalConstraints,
        notes: {},
      }),
    );
  });

  it.each([
    ['ftp://example.com/photo.jpg'],
    ['javascript:alert(1)'],
    ['not a url'],
    ['/uploads/reports/photo.jpg'],
    ['https://example.com/' + 'a'.repeat(2048)],
  ])('refuses the evidence URL %s with 400', async (url) => {
    const { service } = makeService([ticket()]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        supportingEvidenceUrl: url,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(queries).toHaveLength(1);
  });

  it('accepts an http:// evidence URL', async () => {
    const { service } = makeService([
      ticket(),
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        supportingEvidenceUrl: 'http://intranet.porac.gov.ph/photos/1.jpg',
      }),
    ).resolves.toBeTruthy();
  });

  it.each([
    [
      'an unknown key',
      { not_a_constraint: 'x' },
      'Invalid operational constraint note: not_a_constraint',
    ],
    [
      'an array',
      ['equipment'],
      'Operational constraint notes must be an object keyed by constraint.',
    ],
    [
      'a non-text value',
      { equipment: 5 },
      'The note for equipment must be text.',
    ],
    [
      'a note over 500 characters',
      { equipment: 'x'.repeat(501) },
      'The note for equipment must be at most 500 characters',
    ],
    [
      'a note for a constraint that is not selected',
      { weather: 'Rain' },
      'A note was given for weather, which is not selected as an operational constraint.',
    ],
  ])(
    'refuses constraint notes with %s (400)',
    async (_label, notes, message) => {
      const { service } = makeService([ticket()]);
      await expect(
        service.upsert(10, MEO_OFFICER, {
          ...VALID_INPUT,
          operationalConstraintNotes: notes,
        }),
      ).rejects.toThrow(new BadRequestException(message));
      expect(queries).toHaveLength(1);
    },
  );

  it('keeps the audit event shape: no metadata on create or update', async () => {
    const { service, logInPgTx } = makeService([
      ticket(),
      [{ inserted: false }],
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      actualAction: 'Patched',
    });
    expect(logInPgTx).toHaveBeenCalledWith(expect.anything(), {
      actor: expect.objectContaining({ adminId: MEO_OFFICER.adminId }),
      actionType: 'operational_assessment_updated',
      targetType: 'ticket',
      targetId: 10,
      targetSummary: 'Ticket #10',
    });
  });

  it('the fake database refuses a JS Date parameter', () => {
    const { sql } = makeService([]);
    expect(() => sql`SELECT ${new Date()}::timestamptz`).toThrow(/JS Date/);
  });
});

describe('OperationalAssessmentService aligned read model', () => {
  it('keeps legacy snapshots out of edits and accepts a blank combined reason', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: false }],
      [ASSESSMENT_ROW],
    ]);
    await service.upsert(10, MEO_OFFICER, {
      ...VALID_INPUT,
      defermentOrReferralReason: '   ',
    });
    expect(queries[1].text).toContain('deferment_or_referral_reason');
    expect(queries[1].text).not.toMatch(/legacy_|operational_constraint_notes/);
    expect(queries[1].values).toContain(null);
  });
  it('adapts JSONB to selected keys and notes and exposes canonical names only', async () => {
    const { service } = makeService([
      [
        {
          ...ASSESSMENT_ROW,
          operational_constraints: {
            selected: ['equipment'],
            notes: { equipment: 'Backhoe under repair' },
          },
          deferment_or_referral_reason: 'Deferment: Rain\nReferral: DPWH road',
        },
      ],
    ]);
    const result = await service.getForTicket(10);
    expect(result).toMatchObject({
      operationalConstraints: ['equipment'],
      operationalConstraintNotes: { equipment: 'Backhoe under repair' },
      assessedConditions: ASSESSMENT_ROW.assessed_conditions,
      interimMitigation: ASSESSMENT_ROW.interim_mitigation,
      defermentOrReferralReason: 'Deferment: Rain\nReferral: DPWH road',
      createdAt: ASSESSMENT_ROW.created_at,
      assessedByAdminId: 1,
    });
    for (const key of [
      'observedConditions',
      'temporaryMitigation',
      'assessedAt',
      'defermentReason',
      'referralReason',
    ])
      expect(result).not.toHaveProperty(key);
  });
  it('still reads older blank conditions after migration', async () => {
    const { service } = makeService([
      [
        {
          ...ASSESSMENT_ROW,
          assessed_conditions: '',
          operational_constraints: { selected: [], notes: {} },
        },
      ],
    ]);
    expect(await service.getForTicket(10)).toMatchObject({
      assessedConditions: '',
      operationalConstraints: [],
      operationalConstraintNotes: {},
    });
  });
  it('accepts 2100 characters in a combined reason and rejects 2101', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO' }],
      [{ inserted: true }],
      [ASSESSMENT_ROW],
    ]);
    await expect(
      service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        defermentOrReferralReason: 'x'.repeat(2100),
      }),
    ).resolves.toBeTruthy();
    const refused = makeService([[{ assigned_office: 'MEO' }]]);
    await expect(
      refused.service.upsert(10, MEO_OFFICER, {
        ...VALID_INPUT,
        defermentOrReferralReason: 'x'.repeat(2101),
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
