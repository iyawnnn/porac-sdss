import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FocalIntakeService,
  SEVERITY_SCREENING_REMARKS_MAX,
  deriveIntakeState,
  severityScreeningBlock,
  validateSeverityScreening,
} from './focal-intake.service';
import { FocalGuard } from '../common/guards/focal.guard';
import type { TicketsService } from './tickets.service';
import type { NotificationsService } from './../notifications/notifications.service';
import type { AdminAuditService } from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';

const FOCAL: AdminSession = {
  adminId: 10,
  email: 'focal@example.com',
  adminName: 'Diana Torres',
  office: 'MDRRMO',
  accountType: 'PERSONNEL',
  isFocal: true,
};

describe('deriveIntakeState', () => {
  it('is New when there is no acknowledgment and no intake action', () => {
    expect(
      deriveIntakeState({ acknowledgedAt: null, latestActionType: null }),
    ).toBe('New');
  });

  it('is Acknowledged once acknowledged, with no later intake action', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: null,
      }),
    ).toBe('Acknowledged');
  });

  // Manuscript revision Phase 3, step 3f: Screened comes from the report's
  // severity screening; an old 'screened' intake action counts for nothing.
  it('is Screened once the severity screening is anything but NOT_REVIEWED', () => {
    for (const status of [
      'NO_CONCERN_NOTED',
      'REQUIRES_OPERATIONAL_VALIDATION',
    ] as const) {
      expect(
        deriveIntakeState({
          acknowledgedAt: '2026-01-01T00:00:00Z',
          latestActionType: null,
          severityScreeningStatus: status,
          severityScreenedAt: '2026-01-02T00:00:00Z',
        }),
      ).toBe('Screened');
    }
    // Screening needs no acknowledgment first.
    expect(
      deriveIntakeState({
        acknowledgedAt: null,
        latestActionType: null,
        severityScreeningStatus: 'NO_CONCERN_NOTED',
        severityScreenedAt: '2026-01-02T00:00:00Z',
      }),
    ).toBe('Screened');
  });

  it('is not Screened while the severity screening is NOT_REVIEWED, even with an old screened intake action', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'screened',
        latestActionAt: '2026-01-02T00:00:00Z',
        severityScreeningStatus: 'NOT_REVIEWED',
        severityScreenedAt: null,
      }),
    ).toBe('Acknowledged');
    expect(
      deriveIntakeState({
        acknowledgedAt: null,
        latestActionType: 'screened',
        severityScreeningStatus: 'NOT_REVIEWED',
      }),
    ).toBe('New');
  });

  it('takes the later of a forward/escalation and the severity screening (the action on a tie)', () => {
    const base = {
      acknowledgedAt: '2026-01-01T00:00:00Z',
      severityScreeningStatus: 'REQUIRES_OPERATIONAL_VALIDATION' as const,
    };
    expect(
      deriveIntakeState({
        ...base,
        latestActionType: 'forwarded',
        latestActionAt: '2026-01-02T00:00:00Z',
        severityScreenedAt: '2026-01-03T00:00:00Z',
      }),
    ).toBe('Screened');
    expect(
      deriveIntakeState({
        ...base,
        latestActionType: 'escalated',
        latestActionAt: '2026-01-03T00:00:00Z',
        severityScreenedAt: '2026-01-02T00:00:00Z',
      }),
    ).toBe('Escalated');
    expect(
      deriveIntakeState({
        ...base,
        latestActionType: 'forwarded',
        latestActionAt: '2026-01-02T00:00:00Z',
        severityScreenedAt: '2026-01-02T00:00:00Z',
      }),
    ).toBe('Forwarded');
  });

  it('is Forwarded when the latest intake action is forwarded, outranking a stale screened state', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'forwarded',
      }),
    ).toBe('Forwarded');
  });

  it('is Escalated when the latest intake action is escalated', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: 'escalated',
      }),
    ).toBe('Escalated');
  });

  it('never returns Escalated/Forwarded/Screened without an intake action, regardless of acknowledgment', () => {
    expect(
      deriveIntakeState({
        acknowledgedAt: '2026-01-01T00:00:00Z',
        latestActionType: null,
      }),
    ).not.toBe('Escalated');
  });
});

// Mirrors tickets.service.spec.ts's makeService convention: an ordered
// array of row-sets, one per query call in sequence, with sql.begin just
// invoking the callback against the same fake client (no real transaction
// semantics needed for these unit tests).
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
  const createInTx = jest.fn().mockResolvedValue(undefined);
  const notifications = { createInTx } as unknown as NotificationsService;
  const reassignOffice = jest
    .fn()
    .mockResolvedValue({ assignedOffice: 'MDRRMO' });
  const tickets = { reassignOffice } as unknown as TicketsService;

  const service = new FocalIntakeService(sql, tickets, notifications, audit);
  return { service, logInPgTx, createInTx, reassignOffice, sql };
}

// Manuscript revision Phase 2, step 2b: reportReference is the stored
// Appendix H tracking reference, no longer computed as "Report #<id>". The
// field name is unchanged so the Focal screens need no change. (Audit and
// notification text still says "Report #<id>"; that history isn't
// rewritten.)
describe('FocalIntakeService reportReference is the stored tracking reference (Phase 2, step 2b)', () => {
  const source = readFileSync(
    join(__dirname, 'focal-intake.service.ts'),
    'utf8',
  );

  it('maps reportReference from r.tracking_reference in the list, detail and map queries', () => {
    expect(
      source.match(/reportReference: row\.tracking_reference,/g),
    ).toHaveLength(2);
    expect(source).not.toMatch(/reportReference: `Report #/);
    for (const method of ['listIntake', 'listIntakeGeo', 'getIntakeDetail']) {
      const start = source.indexOf(`async ${method}(`);
      const select = source.slice(
        start,
        source.indexOf('FROM reports r', start),
      );
      expect(select).toContain('r.tracking_reference');
    }
  });

  it('the intake detail returns the stored reference', async () => {
    const { service } = makeService([
      [
        {
          report_id: 42,
          tracking_reference: 'PRC-2026-000042',
          ticket_id: 100,
          category: 'Damaged Manhole Cover',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'High',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'Open manhole',
          lat: 15.0,
          lng: 120.5,
          operational_priority: 70,
          acknowledged_at: null,
          acknowledged_by_name: null,
          latest_action_type: null,
        },
      ],
      [], // activity
    ]);

    const detail = await service.getIntakeDetail(42);
    expect(detail?.reportReference).toBe('PRC-2026-000042');
    expect(detail?.linkedTicketReference).toBe('Ticket #100');
  });
});

describe('FocalIntakeService.acknowledge', () => {
  it('404s when the report does not exist', async () => {
    const { service } = makeService([[]]);
    await expect(service.acknowledge(1, FOCAL, undefined)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates the acknowledgment, logs an audit event, notifies the citizen, and fetches the updated detail', async () => {
    const { service, logInPgTx, createInTx } = makeService([
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }], // report lookup
      [{}], // INSERT report_acknowledgments
      [{}], // INSERT acknowledgments (ticket-level, Phase 2 step 2d)
      // getIntakeDetail's two queries:
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Medium',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          operational_priority: 50,
          acknowledged_at: '2026-01-02T00:00:00Z',
          acknowledged_by_name: 'Diana Torres',
          latest_action_type: null,
        },
      ],
      [], // activity
    ]);

    const result = await service.acknowledge(1, FOCAL, '  looks fine  ');

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    expect(logInPgTx.mock.calls[0][1].actionType).toBe('report_acknowledged');
    expect(createInTx).toHaveBeenCalledTimes(1);
    expect(createInTx.mock.calls[0][1]).toMatchObject({
      recipientType: 'citizen',
      recipientId: 5,
      type: 'report_acknowledged',
      title: 'Report acknowledged',
    });
    expect(createInTx.mock.calls[0][1].message).not.toMatch(/under review/i);
    expect(result?.intakeState).toBe('Acknowledged');
  });

  it('maps a unique-constraint violation (second acknowledgment) to a 409, not a silent second row', async () => {
    let i = 0;
    const rows: unknown[][] = [
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }],
    ];
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          if (i === 1) {
            const err = Object.assign(
              new Error('duplicate key value violates unique constraint'),
              {
                code: '23505',
              },
            );
            void Promise.reject(err).then(resolve, reject);
          } else {
            void Promise.resolve(rows[i] ?? []).then(resolve, reject);
          }
          i++;
        },
      };
    }) as unknown as Sql;
    (
      sql as unknown as {
        begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
      }
    ).begin = (cb) => cb(sql);
    const audit = { logInPgTx: jest.fn() } as unknown as AdminAuditService;
    const notifications = {
      createInTx: jest.fn(),
    } as unknown as NotificationsService;
    const tickets = {} as unknown as TicketsService;
    const service = new FocalIntakeService(sql, tickets, notifications, audit);

    await expect(service.acknowledge(1, FOCAL, undefined)).rejects.toThrow(
      ConflictException,
    );
  });
});

// Manuscript revision Phase 3, step 3f: Focal severity screening (Appendix
// H REPORTS severity_screening_*, Table 2). A small stateful fake: one
// report on one ticket, each query matched by its text. An UPDATE reports
// applies its `column = ${value}` assignments (and `= now()`) to the report,
// so the reads before and after show exactly what a screening changed.
// Every write is recorded.
function makeScreeningService(
  options: {
    ticketStatus?: string;
    mergedIntoTicketId?: number | null;
    missing?: boolean;
  } = {},
) {
  const report: Record<string, unknown> = {
    id: 1,
    title: 'Pothole',
    citizen_severity: 'High',
    severity_screening_status: 'NOT_REVIEWED',
    severity_screening_remarks: null,
    severity_screened_by_admin_id: null,
    severity_screened_at: null,
  };
  const ticket = {
    id: 100,
    status: options.ticketStatus ?? 'Reported',
    merged_into_ticket_id: options.mergedIntoTicketId ?? null,
    priority_index: 70,
  };
  const writes: { text: string; values: unknown[] }[] = [];
  const detailRow = () => ({
    report_id: 1,
    tracking_reference: 'PRC-2026-000001',
    ticket_id: ticket.id,
    category: 'Pothole / Road Surface Damage',
    ticket_status: ticket.status,
    assigned_office: 'MEO',
    member_count: 1,
    barangay_name: 'Mitla Proper',
    merged_into_ticket_id: ticket.merged_into_ticket_id,
    citizen_severity: report.citizen_severity,
    submitted_at: '2026-01-01T00:00:00Z',
    flags: [],
    description: 'A pothole',
    lat: 15.0,
    lng: 120.5,
    ticket_lat: 15.0,
    ticket_lng: 120.5,
    submitted_category: 'Pothole / Road Surface Damage',
    operational_priority: ticket.priority_index,
    acknowledged_at: null,
    acknowledged_by_name: null,
    latest_action_type: null,
    latest_action_at: null,
    severity_screening_status: report.severity_screening_status,
    severity_screening_remarks: report.severity_screening_remarks,
    severity_screened_at: report.severity_screened_at,
    severity_screened_by_name:
      report.severity_screened_by_admin_id === FOCAL.adminId
        ? FOCAL.adminName
        : null,
  });
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    let rows: unknown[] = [];
    if (/^\s*(UPDATE|INSERT|DELETE)\b/.test(text)) {
      writes.push({ text, values });
      if (/^\s*UPDATE reports SET/.test(text)) {
        strings.slice(0, -1).forEach((part, i) => {
          const column = /(\w+)\s*=\s*$/.exec(part)?.[1];
          if (column) report[column] = values[i];
        });
        for (const [, column] of text.matchAll(/(\w+)\s*=\s*now\(\)/g)) {
          report[column] = new Date().toISOString();
        }
      }
    } else if (/FOR UPDATE OF r/.test(text)) {
      rows = options.missing
        ? []
        : [
            {
              id: report.id,
              title: report.title,
              severity_screening_status: report.severity_screening_status,
              ticket_id: ticket.id,
              ticket_status: ticket.status,
              merged_into_ticket_id: ticket.merged_into_ticket_id,
            },
          ];
    } else if (/^\s*SELECT action_type AS "actionType"/.test(text)) {
      rows = []; // intake activity
    } else if (/FROM reports r/.test(text)) {
      rows = options.missing ? [] : [detailRow()];
    }
    return Promise.resolve(rows);
  }) as unknown as Sql;
  (
    sql as unknown as {
      begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
    }
  ).begin = (cb) => cb(sql);
  const logInPgTx = jest.fn().mockResolvedValue(undefined);
  const service = new FocalIntakeService(
    sql,
    {} as TicketsService,
    { createInTx: jest.fn() } as unknown as NotificationsService,
    { logInPgTx } as unknown as AdminAuditService,
  );
  return { service, report, ticket, writes, logInPgTx };
}

const MEO: AdminSession = {
  adminId: 20,
  email: 'meo@example.com',
  adminName: 'Mario Reyes',
  office: 'MEO',
  accountType: 'PERSONNEL',
  isFocal: false,
};
const MDRRMO: AdminSession = { ...MEO, adminId: 21, office: 'MDRRMO' };
const SYSTEM_ADMIN: AdminSession = {
  ...MEO,
  adminId: 22,
  office: null,
  accountType: 'SYSTEM_ADMIN',
};

describe('FocalIntakeService.screenSeverity (Phase 3, step 3f)', () => {
  it('is Focal-only: MEO, MDRRMO and the System Administrator get 403 and nothing is read or written', async () => {
    for (const admin of [MEO, MDRRMO, SYSTEM_ADMIN]) {
      const { service, writes, logInPgTx, report } = makeScreeningService();
      await expect(
        service.screenSeverity(1, admin, {
          status: 'NO_CONCERN_NOTED',
          remarks: undefined,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(writes).toHaveLength(0);
      expect(logInPgTx).not.toHaveBeenCalled();
      expect(report.severity_screening_status).toBe('NOT_REVIEWED');
    }
  });

  it('the route sits behind FocalGuard, which rejects MEO, MDRRMO and the System Administrator with 403', () => {
    const allows = (adminSession: AdminSession) => {
      const ctx = {
        switchToHttp: () => ({ getRequest: () => ({ adminSession }) }),
      } as unknown as ExecutionContext;
      try {
        return new FocalGuard().canActivate(ctx);
      } catch (err) {
        return err instanceof ForbiddenException ? 403 : err;
      }
    };
    expect(allows(FOCAL)).toBe(true);
    expect(allows(MEO)).toBe(403);
    expect(allows(MDRRMO)).toBe(403);
    expect(allows(SYSTEM_ADMIN)).toBe(403);

    const controller = readFileSync(
      join(__dirname, 'focal-intake.controller.ts'),
      'utf8',
    );
    expect(controller).toContain('@UseGuards(AdminSessionGuard, FocalGuard)');
    expect(controller).toContain("@Post(':reportId/severity-screening')");
  });

  it('the old general screen action is gone and the service never writes a screened intake action', () => {
    const controller = readFileSync(
      join(__dirname, 'focal-intake.controller.ts'),
      'utf8',
    );
    const service = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    expect(controller).not.toContain("@Post(':reportId/screen')");
    expect(service).not.toMatch(/async screen\(/);
    expect(service).not.toMatch(/VALUES \([^)]*'screened'/);
    expect(service).not.toContain("actionType: 'report_screened'");
  });

  it.each([
    [
      'NOT_REVIEWED',
      'status must be NO_CONCERN_NOTED or REQUIRES_OPERATIONAL_VALIDATION.',
    ],
    [
      'continue',
      'status must be NO_CONCERN_NOTED or REQUIRES_OPERATIONAL_VALIDATION.',
    ],
    [
      undefined,
      'status must be NO_CONCERN_NOTED or REQUIRES_OPERATIONAL_VALIDATION.',
    ],
  ])(
    'rejects status %p with a 400 before touching the database',
    async (status, message) => {
      const { service, writes } = makeScreeningService();
      const attempt = service.screenSeverity(1, FOCAL, {
        status,
        remarks: undefined,
      });
      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toThrow(message);
      expect(writes).toHaveLength(0);
    },
  );

  it('trims remarks, stores empty remarks as NULL and rejects more than 1000 characters or non-text', () => {
    expect(
      validateSeverityScreening({
        status: 'NO_CONCERN_NOTED',
        remarks: '  ok  ',
      }),
    ).toEqual({ status: 'NO_CONCERN_NOTED', remarks: 'ok' });
    expect(
      validateSeverityScreening({ status: 'NO_CONCERN_NOTED', remarks: '   ' })
        .remarks,
    ).toBeNull();
    expect(
      validateSeverityScreening({
        status: 'NO_CONCERN_NOTED',
        remarks: undefined,
      }).remarks,
    ).toBeNull();
    expect(
      validateSeverityScreening({
        status: 'REQUIRES_OPERATIONAL_VALIDATION',
        remarks: ` ${'x'.repeat(SEVERITY_SCREENING_REMARKS_MAX)} `,
      }).remarks,
    ).toHaveLength(1000);
    expect(() =>
      validateSeverityScreening({
        status: 'NO_CONCERN_NOTED',
        remarks: 'x'.repeat(1001),
      }),
    ).toThrow('remarks must be at most 1000 characters.');
    expect(() =>
      validateSeverityScreening({ status: 'NO_CONCERN_NOTED', remarks: 42 }),
    ).toThrow(BadRequestException);
  });

  it('404s when the report does not exist', async () => {
    const { service, writes } = makeScreeningService({ missing: true });
    await expect(
      service.screenSeverity(9, FOCAL, {
        status: 'NO_CONCERN_NOTED',
        remarks: undefined,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(writes).toHaveLength(0);
  });

  it.each(['Resolved', 'Rejected'])(
    'refuses with a 409 while the ticket is %s, writing nothing',
    async (status) => {
      const { service, writes, logInPgTx } = makeScreeningService({
        ticketStatus: status,
      });
      const attempt = service.screenSeverity(1, FOCAL, {
        status: 'NO_CONCERN_NOTED',
        remarks: undefined,
      });
      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow(
        `Ticket #100 is ${status}; a report can only be screened while its ticket is active.`,
      );
      expect(writes).toHaveLength(0);
      expect(logInPgTx).not.toHaveBeenCalled();
    },
  );

  it('refuses with a 409 when the ticket was merged away', async () => {
    const { service, writes } = makeScreeningService({
      mergedIntoTicketId: 200,
    });
    await expect(
      service.screenSeverity(1, FOCAL, {
        status: 'NO_CONCERN_NOTED',
        remarks: undefined,
      }),
    ).rejects.toThrow(
      'Ticket #100 was merged into Ticket #200 and is read-only.',
    );
    expect(writes).toHaveLength(0);
  });

  it.each(['Reported', 'Under Review', 'In Progress'])(
    'is allowed while the ticket is %s',
    async (status) => {
      const { service, report } = makeScreeningService({
        ticketStatus: status,
      });
      await service.screenSeverity(1, FOCAL, {
        status: 'NO_CONCERN_NOTED',
        remarks: undefined,
      });
      expect(report.severity_screening_status).toBe('NO_CONCERN_NOTED');
    },
  );

  it('writes the four fields (by = the Focal actor, at = now()) and returns the screening on the detail', async () => {
    const { service, report, writes } = makeScreeningService();
    const detail = await service.screenSeverity(1, FOCAL, {
      status: 'REQUIRES_OPERATIONAL_VALIDATION',
      remarks: '  Photo shows a much smaller hole.  ',
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].text).toMatch(/^\s*UPDATE reports SET/);
    expect(writes[0].text).toContain('severity_screened_at = now()');
    expect(writes[0].values).toEqual([
      'REQUIRES_OPERATIONAL_VALIDATION',
      'Photo shows a much smaller hole.',
      FOCAL.adminId,
      1,
    ]);
    expect(report).toMatchObject({
      severity_screening_status: 'REQUIRES_OPERATIONAL_VALIDATION',
      severity_screening_remarks: 'Photo shows a much smaller hole.',
      severity_screened_by_admin_id: FOCAL.adminId,
    });
    expect(report.severity_screened_at).toEqual(expect.any(String));
    expect(detail?.severityScreening).toEqual({
      status: 'REQUIRES_OPERATIONAL_VALIDATION',
      remarks: 'Photo shows a much smaller hole.',
      screenedByName: 'Diana Torres',
      screenedAt: report.severity_screened_at,
      blockedReason: null,
    });
    expect(detail?.intakeState).toBe('Screened');
  });

  it('re-screening overwrites the current values, remarks included', async () => {
    const { service, report, logInPgTx } = makeScreeningService();
    await service.screenSeverity(1, FOCAL, {
      status: 'REQUIRES_OPERATIONAL_VALIDATION',
      remarks: 'Check on site.',
    });
    const detail = await service.screenSeverity(1, FOCAL, {
      status: 'NO_CONCERN_NOTED',
      remarks: undefined,
    });
    expect(report.severity_screening_status).toBe('NO_CONCERN_NOTED');
    expect(report.severity_screening_remarks).toBeNull();
    expect(detail?.severityScreening.status).toBe('NO_CONCERN_NOTED');
    expect(detail?.severityScreening.remarks).toBeNull();
    expect(logInPgTx).toHaveBeenCalledTimes(2);
    expect(logInPgTx.mock.calls[1][1].metadata).toEqual({
      oldStatus: 'REQUIRES_OPERATIONAL_VALIDATION',
      newStatus: 'NO_CONCERN_NOTED',
      remarks: null,
    });
  });

  it('every screening writes one report_severity_screened audit event on the report, in the transaction', async () => {
    const { service, logInPgTx } = makeScreeningService();
    await service.screenSeverity(1, FOCAL, {
      status: 'REQUIRES_OPERATIONAL_VALIDATION',
      remarks: ' Check on site. ',
    });
    expect(logInPgTx).toHaveBeenCalledTimes(1);
    expect(logInPgTx.mock.calls[0][1]).toEqual({
      actor: {
        adminId: FOCAL.adminId,
        adminName: FOCAL.adminName,
        email: FOCAL.email,
        accountType: 'PERSONNEL',
        office: 'MDRRMO',
      },
      actionType: 'report_severity_screened',
      targetType: 'report',
      targetId: 1,
      targetSummary: 'Pothole (Report #1)',
      metadata: {
        oldStatus: 'NOT_REVIEWED',
        newStatus: 'REQUIRES_OPERATIONAL_VALIDATION',
        remarks: 'Check on site.',
      },
    });
  });

  it("never changes the citizen's severity, the ticket's severity or Operational Priority", async () => {
    const { service, writes } = makeScreeningService();
    const severityRank = (s: string) =>
      ({ Low: 1, Medium: 2, High: 3, Critical: 4 })[s];
    const before = await service.getIntakeDetail(1);

    const after = await service.screenSeverity(1, FOCAL, {
      status: 'REQUIRES_OPERATIONAL_VALIDATION',
      remarks: 'Looks less severe than reported.',
    });

    // The citizen's severity, and the ticket's (MAX citizen_severity of its
    // reports, here one).
    expect(after?.citizenSeverity).toBe('High');
    expect(after?.citizenSeverity).toBe(before?.citizenSeverity);
    expect(severityRank(after!.citizenSeverity)).toBe(
      severityRank(before!.citizenSeverity),
    );
    expect(after?.operationalPriority).toBe(70);
    expect(after?.operationalPriority).toBe(before?.operationalPriority);
    // The only write is the report's four screening columns.
    expect(writes).toHaveLength(1);
    const assigned = [...writes[0].text.matchAll(/(\w+)\s*=\s*(\?|now\(\))/g)]
      .map((m) => m[1])
      .filter((column) => column !== 'id');
    expect(assigned).toEqual([
      'severity_screening_status',
      'severity_screening_remarks',
      'severity_screened_by_admin_id',
      'severity_screened_at',
    ]);
    expect(writes[0].text).not.toMatch(
      /citizen_severity|priority_index|tickets/,
    );
    // No Operational Priority recalculation is wired into this service.
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    expect(source).not.toContain('OperationalPriorityService');
    expect(source).not.toMatch(/SET[^`]*citizen_severity/);
  });

  it("the detail says why screening is blocked on a closed ticket, with the action's own message", async () => {
    const { service } = makeScreeningService({ ticketStatus: 'Resolved' });
    const detail = await service.getIntakeDetail(1);
    expect(detail?.severityScreening).toMatchObject({
      status: 'NOT_REVIEWED',
      remarks: null,
      screenedByName: null,
      screenedAt: null,
      blockedReason:
        'Ticket #100 is Resolved; a report can only be screened while its ticket is active.',
    });
    expect(detail?.intakeState).toBe('New');
  });

  it('severityScreeningBlock: active and not merged away', () => {
    expect(
      severityScreeningBlock({
        id: 5,
        status: 'In Progress',
        mergedIntoTicketId: null,
      }),
    ).toBeNull();
    expect(
      severityScreeningBlock({
        id: 5,
        status: 'Reported',
        mergedIntoTicketId: 6,
      }),
    ).toBe('Ticket #5 was merged into Ticket #6 and is read-only.');
  });

  it('the intake list, map and detail queries ignore old screened intake actions and read the screening columns', () => {
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    expect(
      source.match(
        /WHERE report_id = r\.id AND action_type IN \('forwarded', 'escalated'\)/g,
      ),
    ).toHaveLength(3);
    for (const method of ['listIntake', 'listIntakeGeo', 'getIntakeDetail']) {
      const start = source.indexOf(`async ${method}(`);
      const select = source.slice(
        start,
        source.indexOf('FROM reports r', start),
      );
      expect(select).toContain('r.severity_screening_status');
      expect(select).toContain('r.severity_screened_at');
      expect(select).toContain('latest.created_at AS latest_action_at');
    }
  });
});

describe('FocalIntakeService.forward', () => {
  it('delegates the office change to TicketsService.reassignOffice — never duplicates reassignment logic', async () => {
    const { service, reassignOffice } = makeService([
      [{ id: 1, ticket_id: 100 }], // report lookup
      [{}], // INSERT report_intake_actions
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MDRRMO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Medium',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          operational_priority: 50,
          acknowledged_at: null,
          acknowledged_by_name: null,
          latest_action_type: 'forwarded',
        },
      ],
      [],
    ]);

    await service.forward(1, FOCAL, 'MDRRMO', 'Better suited to MDRRMO');

    expect(reassignOffice).toHaveBeenCalledWith(100, FOCAL, 'MDRRMO');
  });

  it('rejects with no reason provided, before touching reassignOffice', async () => {
    const { service, reassignOffice } = makeService([
      [{ id: 1, ticket_id: 100 }],
    ]);
    await expect(service.forward(1, FOCAL, 'MDRRMO', '   ')).rejects.toThrow(
      BadRequestException,
    );
    expect(reassignOffice).not.toHaveBeenCalled();
  });

  it('404s when the report does not exist', async () => {
    const { service, reassignOffice } = makeService([[]]);
    await expect(service.forward(1, FOCAL, 'MDRRMO', 'reason')).rejects.toThrow(
      NotFoundException,
    );
    expect(reassignOffice).not.toHaveBeenCalled();
  });
});

describe('FocalIntakeService.escalate', () => {
  it('requires a reason', async () => {
    const { service } = makeService([]);
    await expect(service.escalate(1, FOCAL, '')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('notifies the CURRENTLY responsible office, logs the action, and leaves ticket status/office untouched', async () => {
    const { service, logInPgTx, createInTx } = makeService([
      [
        {
          id: 1,
          title: 'Pothole',
          ticket_id: 100,
          tracking_reference: 'PRC-2026-000001',
        },
      ], // report lookup
      [{ assigned_office: 'MEO' }], // ticket office lookup
      [{}], // INSERT report_intake_actions
      [
        {
          report_id: 1,
          ticket_id: 100,
          category: 'Pothole',
          ticket_status: 'Reported',
          assigned_office: 'MEO',
          member_count: 1,
          barangay_name: 'Mitla Proper',
          citizen_severity: 'Critical',
          submitted_at: '2026-01-01T00:00:00Z',
          flags: [],
          description: 'A pothole',
          lat: 15.0,
          lng: 120.5,
          operational_priority: 90,
          acknowledged_at: null,
          acknowledged_by_name: null,
          latest_action_type: 'escalated',
        },
      ],
      [],
    ]);

    const result = await service.escalate(1, FOCAL, 'Needs urgent attention');

    expect(logInPgTx.mock.calls[0][1].actionType).toBe('report_escalated');
    expect(createInTx.mock.calls[0][1]).toMatchObject({
      recipientType: 'admin',
      recipientOffice: 'MEO',
      type: 'report_escalated',
      href: '/admin/tickets/100',
    });
    // Named by its tracking reference since the Phase 2, step 2b follow-up.
    const [, escalated] = createInTx.mock.calls[0] as [
      unknown,
      { message: string },
    ];
    expect(escalated.message).toBe(
      'Pothole (Report PRC-2026-000001) was escalated by Focal: Needs urgent attention',
    );
    expect(result?.ticketStatus).toBe('Reported');
    expect(result?.routedOffice).toBe('MEO');
    // No score field is ever written by escalate — the Operational Priority
    // on the returned detail is read straight off the ticket, unchanged.
    // (Hazard Urgency left the Focal responses in manuscript revision
    // Phase 1, step 6b.)
    expect(result?.operationalPriority).toBe(90);
    expect(result).not.toHaveProperty('hazardUrgency');
  });
});

// Batch 4 (five-role production alignment): a Focal-safe read-only map
// endpoint, built from the same intake source as listIntake() but geo-
// enabled — never the operational GET /admin/tickets/geo endpoint (which
// stays behind OperationalStaffGuard, untouched). Must expose only
// intake-relevant fields: no Operational Assessment content, no Work Order
// internals, no staff assignment, no status-mutation-sensitive data.
describe('FocalIntakeService.listIntakeGeo', () => {
  it('returns report-level points with coordinates and intake-relevant fields only', async () => {
    const { service } = makeService([
      [
        {
          report_id: 1,
          tracking_reference: 'PRC-2026-000001',
          category: 'Pothole',
          barangay_name: 'Mitla Proper',
          assigned_office: 'MEO',
          operational_priority: 62,
          acknowledged_at: null,
          latest_action_type: null,
          lat: 15.05,
          lng: 120.54,
        },
      ],
    ]);
    const rows = await service.listIntakeGeo();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reportId: 1,
      reportReference: 'PRC-2026-000001',
      category: 'Pothole',
      barangayName: 'Mitla Proper',
      routedOffice: 'MEO',
      lat: 15.05,
      lng: 120.54,
      intakeState: 'New',
    });
    // Operational Priority comes through on the map rows (manuscript
    // revision Phase 1, step 6b); Hazard Urgency no longer does.
    expect(rows[0].operationalPriority).toBe(62);
    expect(rows[0]).not.toHaveProperty('hazardUrgency');
  });

  it('never exposes Operational Assessment, Work Order, or staff-assignment fields', () => {
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    const methodBody = source.slice(
      source.indexOf('async listIntakeGeo('),
      source.indexOf('\n  async getIntakeDetail('),
    );
    expect(methodBody).not.toContain('operational_assessments');
    expect(methodBody).not.toContain('work_orders');
    expect(methodBody).not.toContain('assigned_admin');
  });
});

// Manuscript revision Phase 1, step 6b: Focal Intake shows Operational
// Priority only, so no Focal query or response shape reads Hazard Urgency.
describe('focal-intake.service.ts reads no Hazard Urgency column', () => {
  it('contains no priority_score, urgency_level or hazardUrgency', () => {
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/priority_score|urgency_level|hazardUrgency/);
    expect(source).toContain('t.priority_index AS operational_priority');
  });

  // Manuscript revision Phase 1, step 7a: the intake detail's elevation line
  // was removed, so no Focal query or response carries the elevation.
  it('contains no elevation_m or elevationM', () => {
    const source = readFileSync(
      join(__dirname, 'focal-intake.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/elevation_m|elevationM/);
  });
});

// Manuscript revision Phase 2, step 2d (Appendix H ACKNOWLEDGMENTS): the
// first acknowledged report on a ticket also writes one ticket-level row in
// the same transaction (ON CONFLICT (ticket_id) DO NOTHING); every read stays
// on report_acknowledgments. Same fake client as makeService above, except
// that it records each query's text, values, and whether it ran inside the
// sql.begin callback.
describe('ticket-level acknowledgments dual-write (Phase 2, step 2d)', () => {
  const DETAIL_ROW = {
    report_id: 1,
    tracking_reference: 'PRC-2026-000001',
    ticket_id: 100,
    category: 'Pothole',
    ticket_status: 'Reported',
    assigned_office: 'MEO',
    member_count: 1,
    barangay_name: 'Mitla Proper',
    citizen_severity: 'Medium',
    submitted_at: '2026-01-01T00:00:00Z',
    flags: [],
    description: 'A pothole',
    lat: 15.0,
    lng: 120.5,
    operational_priority: 50,
    acknowledged_at: '2026-01-02T00:00:00Z',
    acknowledged_by_name: 'Diana Torres',
    latest_action_type: null,
  };

  function makeRecordingService(rows: unknown[]) {
    const calls: { text: string; values: unknown[]; inTx: boolean }[] = [];
    let i = 0;
    let inTx = false;
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values, inTx });
      const next = rows[i++] ?? [];
      return {
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
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
    ).begin = async (cb) => {
      inTx = true;
      try {
        return await cb(sql);
      } finally {
        inTx = false;
      }
    };
    const logInPgTx = jest.fn().mockResolvedValue(undefined);
    const createInTx = jest.fn().mockResolvedValue(undefined);
    const service = new FocalIntakeService(
      sql,
      {} as TicketsService,
      { createInTx } as unknown as NotificationsService,
      { logInPgTx } as unknown as AdminAuditService,
    );
    const inserts = (table: string) =>
      calls.filter((c) => c.text.includes(`INSERT INTO ${table} `));
    return { service, calls, inserts, logInPgTx, createInTx };
  }

  const uniqueViolation = () =>
    Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });

  it('the first acknowledgment on a ticket writes one ticket row, in the same transaction, after the report row', async () => {
    const { service, calls, inserts } = makeRecordingService([
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }], // report lookup
      [{}], // INSERT report_acknowledgments
      Object.assign([], { count: 1 }), // INSERT acknowledgments: new row
      [DETAIL_ROW], // getIntakeDetail
      [], // activity
    ]);

    const result = await service.acknowledge(1, FOCAL, '  looks fine  ');

    const ticketRows = inserts('acknowledgments');
    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].inTx).toBe(true);
    expect(ticketRows[0].text).toContain('ON CONFLICT (ticket_id) DO NOTHING');
    expect(ticketRows[0].text).toMatch(/now\(\)\s*\)/);
    // The report's ticket, the acting admin, and the same trimmed remarks as
    // the report row.
    expect(ticketRows[0].values).toEqual([100, 10, 'looks fine']);
    const reportRow = inserts('report_acknowledgments')[0];
    expect(reportRow.values[3]).toBe('looks fine');
    expect(calls.indexOf(reportRow)).toBeLessThan(calls.indexOf(ticketRows[0]));
    expect(result?.intakeState).toBe('Acknowledged');
  });

  it('a second report on the same ticket adds no row and leaves the first one unchanged', async () => {
    const { service, calls, inserts } = makeRecordingService([
      [{ id: 2, citizen_id: 6, ticket_id: 100, title: 'Same pothole' }],
      [{}], // INSERT report_acknowledgments
      Object.assign([], { count: 0 }), // INSERT acknowledgments: conflict, nothing inserted
      [{ ...DETAIL_ROW, report_id: 2 }],
      [],
    ]);

    await expect(
      service.acknowledge(2, FOCAL, undefined),
    ).resolves.not.toBeNull();

    // Only DO NOTHING on conflict: the ticket's existing row is never updated.
    const ticketRows = inserts('acknowledgments');
    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].text).not.toMatch(/DO UPDATE/);
    expect(ticketRows[0].values).toEqual([100, 10, null]);
    expect(calls.some((c) => /UPDATE acknowledgments/.test(c.text))).toBe(
      false,
    );
  });

  it('acknowledging the same report twice still 409s and writes no ticket row', async () => {
    const { service, inserts, logInPgTx, createInTx } = makeRecordingService([
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }],
      uniqueViolation(), // INSERT report_acknowledgments: already acknowledged
    ]);

    await expect(service.acknowledge(1, FOCAL, undefined)).rejects.toThrow(
      ConflictException,
    );
    expect(inserts('acknowledgments')).toHaveLength(0);
    expect(logInPgTx).not.toHaveBeenCalled();
    expect(createInTx).not.toHaveBeenCalled();
  });

  it('a failed acknowledgment writes nothing', async () => {
    const missing = makeRecordingService([[]]); // report lookup: none
    await expect(
      missing.service.acknowledge(404, FOCAL, undefined),
    ).rejects.toThrow(NotFoundException);
    expect(missing.inserts('report_acknowledgments')).toHaveLength(0);
    expect(missing.inserts('acknowledgments')).toHaveLength(0);

    const broken = makeRecordingService([
      [{ id: 1, citizen_id: 5, ticket_id: 100, title: 'Pothole' }],
      new Error('connection lost'), // INSERT report_acknowledgments fails
    ]);
    await expect(
      broken.service.acknowledge(1, FOCAL, undefined),
    ).rejects.toThrow('connection lost');
    expect(broken.inserts('acknowledgments')).toHaveLength(0);
  });
});
