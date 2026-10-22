import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import type { Sql } from 'postgres';
import type { ConfigService } from '@nestjs/config';
import type { AdminSession } from '../auth/session.service';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import type { AdminAuditService } from './admin-audit.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ROUTING_ADMIN_NAME_MAX_LENGTH,
  ROUTING_REASON_NOT_RECORDED,
} from '../db/schema';

const MEO_OFFICER = { role: 'officer', office: 'MEO' } as Pick<
  AdminSession,
  'role' | 'office'
>;
const MDRRMO_SUPERVISOR = {
  role: 'supervisor',
  office: 'MDRRMO',
} as Pick<AdminSession, 'role' | 'office'>;
const SYSTEM_ADMIN = { role: 'system_admin', office: null } as Pick<
  AdminSession,
  'role' | 'office'
>;

describe('parseTicketQuery category filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );

  it.each(['Localized Flooding', 'Pothole / Road Surface Damage', 'Other Minor Infrastructure Hazard'])(
    'accepts a known current category %s',
    (category) => {
      expect(service.parseTicketQuery({ category }, MEO_OFFICER).category).toBe(
        category,
      );
    },
  );

  it.each(['Flooding', 'Pothole', 'Other'])(
    'still accepts a legacy category %s, so historical tickets stay filterable',
    (category) => {
      expect(service.parseTicketQuery({ category }, MEO_OFFICER).category).toBe(
        category,
      );
    },
  );

  it('rejects an unknown category', () => {
    expect(
      service.parseTicketQuery({ category: 'Not A Real Category' }, MEO_OFFICER)
        .category,
    ).toBeUndefined();
  });

  it('defaults to undefined when category is absent', () => {
    expect(service.parseTicketQuery({}, MEO_OFFICER).category).toBeUndefined();
  });
});

describe('parseTicketQuery office scoping', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );

  it('clamps an officer to their own office regardless of the query param', () => {
    expect(service.parseTicketQuery({}, MEO_OFFICER).office).toBe('MEO');
    expect(
      service.parseTicketQuery({ office: 'MDRRMO' }, MEO_OFFICER).office,
    ).toBe('MEO');
    expect(
      service.parseTicketQuery({ office: 'all' }, MEO_OFFICER).office,
    ).toBe('MEO');
  });

  it('clamps a supervisor to their own office regardless of the query param', () => {
    expect(
      service.parseTicketQuery({ office: 'MEO' }, MDRRMO_SUPERVISOR).office,
    ).toBe('MDRRMO');
  });

  // Batch 1 (five-role RBAC): system_admin no longer has routine
  // operational access — resolveOfficeScope now rejects it outright rather
  // than widening to city-wide or honoring a requested office.
  it('rejects a system admin outright rather than defaulting to city-wide', () => {
    expect(() => service.parseTicketQuery({}, SYSTEM_ADMIN)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a system admin even when a specific office is requested', () => {
    expect(() =>
      service.parseTicketQuery({ office: 'MDRRMO' }, SYSTEM_ADMIN),
    ).toThrow(ForbiddenException);
  });
});

describe('parseTicketQuery disputed filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );

  it('parses disputed=true', () => {
    expect(
      service.parseTicketQuery({ disputed: 'true' }, MEO_OFFICER).disputed,
    ).toBe(true);
  });

  it('defaults to undefined (unfiltered) when absent, matching the overdue-boolean convention', () => {
    expect(service.parseTicketQuery({}, MEO_OFFICER).disputed).toBeUndefined();
  });

  it('treats any non-"true" value as unfiltered', () => {
    expect(
      service.parseTicketQuery({ disputed: 'false' }, MEO_OFFICER).disputed,
    ).toBeUndefined();
  });
});

// Manuscript revision Phase 2, step 2a (handoff Decision 13): the
// "Needs category review" queue filter, same strict-"true" shape as disputed.
describe('parseTicketQuery categoryReview filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );

  it('parses categoryReview=true', () => {
    expect(
      service.parseTicketQuery({ categoryReview: 'true' }, MEO_OFFICER)
        .categoryReview,
    ).toBe(true);
  });

  it('defaults to undefined (unfiltered) when absent', () => {
    expect(
      service.parseTicketQuery({}, MEO_OFFICER).categoryReview,
    ).toBeUndefined();
  });

  it('treats any non-"true" value as unfiltered', () => {
    for (const value of ['false', '1', 'TRUE', 'yes', '']) {
      expect(
        service.parseTicketQuery({ categoryReview: value }, MEO_OFFICER)
          .categoryReview,
      ).toBeUndefined();
    }
  });

  it('leaves the other filters alone when set', () => {
    const filters = service.parseTicketQuery(
      { categoryReview: 'true', status: 'all' },
      MEO_OFFICER,
    );
    expect(filters.status).toBe('all');
    expect(filters.office).toBe('MEO');
    expect(filters.disputed).toBeUndefined();
  });
});

describe('cross-office access to single-resource ticket endpoints', () => {
  function makeService(rows: unknown[][]) {
    let i = 0;
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void) {
          void Promise.resolve(rows[i++] ?? []).then(resolve);
        },
      };
    }) as unknown as Sql;
    return new TicketsService(
      sql,
      {} as MediaService,
      {} as NotificationsService,
      {} as EmailService,
      {} as ConfigService<Env, true>,
      {} as AdminAuditService,
    );
  }

  it("rejects ticket detail for an officer viewing another office's ticket", async () => {
    const service = makeService([
      [{ id: 1, assigned_office: 'MDRRMO' }], // ticket lookup
    ]);
    await expect(service.getTicketDetail(1, MEO_OFFICER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows ticket detail for an officer viewing their own office's ticket", async () => {
    const service = makeService([
      [{ id: 1, assigned_office: 'MEO' }], // ticket lookup
      [], // reports
      [], // status_history
      [], // office_reassignments
    ]);
    const detail = await service.getTicketDetail(1, MEO_OFFICER);
    expect(detail?.ticket.assigned_office).toBe('MEO');
  });

  // Batch 1 (five-role RBAC): system_admin no longer has routine
  // operational access — assertOfficeAccess now rejects it outright rather
  // than bypassing the office check.
  it('rejects a system admin from viewing ticket detail — no more city-wide bypass', async () => {
    const service = makeService([[{ id: 1, assigned_office: 'MDRRMO' }]]);
    await expect(service.getTicketDetail(1, SYSTEM_ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('computes direct_responsibility from category per the manuscript-aligned routing table', async () => {
    const direct = await makeService([
      [{ id: 1, assigned_office: 'MEO', category: 'Pothole' }],
      [],
      [],
      [],
      [],
    ]).getTicketDetail(1, MEO_OFFICER);
    expect(direct?.ticket.direct_responsibility).toBe(true);

    const referral = await makeService([
      [{ id: 2, assigned_office: 'MEO', category: 'Leaking Pipe' }],
      [],
      [],
      [],
      [],
    ]).getTicketDetail(2, MEO_OFFICER);
    expect(referral?.ticket.direct_responsibility).toBe(false);
  });

  it('maps referral audit events into the referrals array, never as live state', async () => {
    const service = makeService([
      [{ id: 3, assigned_office: 'MEO', category: 'Uncollected Garbage' }], // ticket lookup
      [], // reports
      [], // status_history
      [], // office_reassignments
      [
        {
          metadata: { agency: 'MENRO', note: 'Called 8/15' },
          actor_name: 'Jane Doe',
          created_at: '2026-08-15T00:00:00.000Z',
        },
      ], // referral audit events
    ]);
    const detail = await service.getTicketDetail(3, MEO_OFFICER);
    expect(detail?.referrals).toEqual([
      { agency: 'MENRO', note: 'Called 8/15', admin_name: 'Jane Doe', referred_at: '2026-08-15T00:00:00.000Z' },
    ]);
  });

  it("rejects a status advance on another office's ticket", async () => {
    const service = makeService([
      [{ status: 'Reported', assigned_office: 'MDRRMO' }], // ticket lookup
    ]);
    await expect(
      service.advanceStatus(
        1,
        MEO_OFFICER as AdminSession,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects resolution notes over TICKET_RESOLUTION_NOTES_MAX_LENGTH', async () => {
    const service = makeService([
      [{ status: 'In Progress', assigned_office: 'MEO', category: 'Flooding' }], // ticket lookup
    ]);
    await expect(
      service.advanceStatus(
        1,
        MEO_OFFICER as AdminSession,
        'x'.repeat(2001),
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects reassigning a ticket that is not the acting admin's own office", async () => {
    const service = makeService([
      [{ assigned_office: 'MDRRMO' }], // ticket lookup
    ]);
    await expect(
      service.reassignOffice(1, MEO_OFFICER as AdminSession, 'MEO'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('admin audit logging for ticket mutations', () => {
  // sql.begin just runs the callback against the same fake client — no real
  // transaction semantics needed, mirroring moderation.service.spec.ts's
  // makeFakeSql. logInPgTx is a mocked AdminAuditService method, not a
  // tagged-template call, so it never consumes a slot from `rows`.
  function makeService(rows: unknown[][]) {
    let i = 0;
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void) {
          void Promise.resolve(rows[i++] ?? []).then(resolve);
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
    const createInTx = jest.fn();
    const sendReportRejected = jest.fn().mockResolvedValue(undefined);
    const service = new TicketsService(
      sql,
      {} as MediaService,
      { createInTx } as unknown as NotificationsService,
      { sendReportRejected } as unknown as EmailService,
      { get: jest.fn().mockReturnValue('https://porac.example') } as unknown as ConfigService<Env, true>,
      audit,
    );
    return { service, logInPgTx, createInTx, sendReportRejected };
  }

  it('logs ticket_status_advanced inside the same transaction as the status change', async () => {
    const { service, logInPgTx } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Flooding' }], // ticket lookup
      [{}], // UPDATE tickets
      [{}], // INSERT status_history
      [], // citizenRows (no notification recipients)
    ]);

    await service.advanceStatus(
      7,
      MEO_OFFICER as AdminSession,
      undefined,
      undefined,
    );

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, input] = logInPgTx.mock.calls[0];
    expect(input.actionType).toBe('ticket_status_advanced');
    expect(input.targetType).toBe('ticket');
    expect(input.targetId).toBe(7);
    expect(input.metadata).toEqual({ from: 'Reported', to: 'Under Review' });
  });

  // Regression guard for the advanceStatus race: two requests reading the
  // same starting status can no longer both succeed. The UPDATE is now
  // guarded on the status this request actually read (WHERE status =
  // <expected>) — a second, stale request finds that row already moved and
  // its UPDATE matches zero rows, which is what `count: 0` simulates here.
  it('rejects a stale advance when another request already changed the status, before any status_history/audit/notification write', async () => {
    const { service, logInPgTx, createInTx } = makeService([
      [{ status: 'In Progress', assigned_office: 'MEO', category: 'Flooding' }], // ticket lookup
      Object.assign([], { count: 0 }), // UPDATE tickets — 0 rows matched, another request already advanced it
    ]);

    await expect(
      service.advanceStatus(
        7,
        MEO_OFFICER as AdminSession,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(ConflictException);

    // The conflict must short-circuit before every write that follows the
    // UPDATE in the same transaction — no status_history row (there is no
    // third mocked row for it to consume), no audit event, no notification.
    expect(logInPgTx).not.toHaveBeenCalled();
    expect(createInTx).not.toHaveBeenCalled();
  });

  it('logs ticket_reassigned inside the same transaction as the reassignment', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO', category: 'Pothole' }], // ticket lookup
      [{}], // UPDATE tickets
      [{}], // INSERT office_reassignments
    ]);

    await service.reassignOffice(9, MEO_OFFICER as AdminSession, 'MDRRMO');

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, input] = logInPgTx.mock.calls[0];
    expect(input.actionType).toBe('ticket_reassigned');
    expect(input.targetId).toBe(9);
    expect(input.metadata).toEqual({ from: 'MEO', to: 'MDRRMO' });
  });

  // Batch 2 (Focal intake): reassignOffice gains a Focal-specific
  // authorization branch (early-intake Forward) alongside the existing
  // assertOfficeAccess path for operational staff — same reassignment
  // mechanism, same office_reassignments/audit write, different gate.
  const FOCAL = { role: 'focal', office: 'MDRRMO' } as AdminSession;

  it('allows Focal to reassign a Reported ticket with no active work order', async () => {
    const { service, logInPgTx } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Pothole' }], // ticket lookup
      [{ count: 0 }], // active work-order count
      [{}], // UPDATE tickets
      [{}], // INSERT office_reassignments
    ]);

    const result = await service.reassignOffice(11, FOCAL, 'MDRRMO');
    expect(result).toEqual({ assignedOffice: 'MDRRMO' });
    expect(logInPgTx).toHaveBeenCalledTimes(1);
    expect(logInPgTx.mock.calls[0][1].actionType).toBe('ticket_reassigned');
  });

  it('rejects Focal reassigning a ticket that already left Reported (Under Review)', async () => {
    const { service, logInPgTx } = makeService([
      [{ status: 'Under Review', assigned_office: 'MEO', category: 'Pothole' }], // ticket lookup
    ]);

    await expect(service.reassignOffice(12, FOCAL, 'MDRRMO')).rejects.toThrow(
      ForbiddenException,
    );
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('rejects Focal reassigning a Reported ticket that already has an active work order', async () => {
    const { service, logInPgTx } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Pothole' }], // ticket lookup
      [{ count: 1 }], // active work-order count
    ]);

    await expect(service.reassignOffice(13, FOCAL, 'MDRRMO')).rejects.toThrow(
      ForbiddenException,
    );
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('logs ticket_referral_noted without mutating the ticket row', async () => {
    const { service, logInPgTx } = makeService([
      [{ assigned_office: 'MEO', category: 'Leaking Pipe' }], // ticket lookup
    ]);

    await service.logReferral(9, MEO_OFFICER as AdminSession, 'Water utility provider', 'Contacted 8/15');

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, input] = logInPgTx.mock.calls[0];
    expect(input.actionType).toBe('ticket_referral_noted');
    expect(input.targetId).toBe(9);
    expect(input.metadata).toEqual({ agency: 'Water utility provider', note: 'Contacted 8/15' });
  });

  it('rejects logReferral on another office\'s ticket', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MDRRMO', category: 'Leaking Pipe' }], // ticket lookup
    ]);

    await expect(
      service.logReferral(9, MEO_OFFICER as AdminSession, 'MENRO', undefined),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an empty agency', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO', category: 'Leaking Pipe' }], // ticket lookup
    ]);

    await expect(
      service.logReferral(9, MEO_OFFICER as AdminSession, '   ', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a note over REFERRAL_NOTE_MAX_LENGTH', async () => {
    const { service } = makeService([
      [{ assigned_office: 'MEO', category: 'Leaking Pipe' }], // ticket lookup
    ]);

    await expect(
      service.logReferral(9, MEO_OFFICER as AdminSession, 'MENRO', 'x'.repeat(1001)),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a Reported ticket: status Rejected, status_history + ticket_rejected audit + citizen notification + email, all with the reason', async () => {
    const { service, logInPgTx, createInTx, sendReportRejected } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }], // ticket lookup
      [{}], // UPDATE tickets
      [{}], // INSERT status_history
      [{ citizen_id: 1, report_id: 10, email: 'citizen@example.com' }], // citizenRows
    ]);

    const result = await service.rejectTicket(9, MEO_OFFICER as AdminSession, 'Not within city limits.');

    expect(result).toEqual({ status: 'Rejected' });

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, auditInput] = logInPgTx.mock.calls[0];
    expect(auditInput.actionType).toBe('ticket_rejected');
    expect(auditInput.targetType).toBe('ticket');
    expect(auditInput.targetId).toBe(9);
    expect(auditInput.metadata).toEqual({
      from: 'Reported',
      to: 'Rejected',
      reason: 'Not within city limits.',
    });

    expect(createInTx).toHaveBeenCalledTimes(1);
    const [, notificationInput] = createInTx.mock.calls[0];
    expect(notificationInput.recipientType).toBe('citizen');
    expect(notificationInput.recipientId).toBe(1);
    expect(notificationInput.type).toBe('ticket_rejected');
    expect(notificationInput.message).toContain('Not within city limits.');

    expect(sendReportRejected).toHaveBeenCalledTimes(1);
    expect(sendReportRejected).toHaveBeenCalledWith(
      'citizen@example.com',
      expect.stringContaining('/dashboard/reports/10'),
      'Not within city limits.',
    );
  });

  it.each(['Under Review', 'In Progress'])(
    'allows rejecting a %s ticket (any active status, not just Reported)',
    async (status) => {
      const { service } = makeService([
        [{ status, assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }],
        [{}],
        [{}],
        [],
      ]);
      const result = await service.rejectTicket(9, MEO_OFFICER as AdminSession, 'No longer applicable.');
      expect(result).toEqual({ status: 'Rejected' });
    },
  );

  it('rejects rejecting a ticket on another office', async () => {
    const { service } = makeService([
      [{ status: 'Reported', assigned_office: 'MDRRMO', category: 'Localized Flooding' }],
    ]);
    await expect(
      service.rejectTicket(9, MEO_OFFICER as AdminSession, 'Reason'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects rejecting an already-Resolved ticket', async () => {
    const { service } = makeService([
      [{ status: 'Resolved', assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }],
    ]);
    await expect(
      service.rejectTicket(9, MEO_OFFICER as AdminSession, 'Reason'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects rejecting an already-Rejected ticket (no double-reject)', async () => {
    const { service } = makeService([
      [{ status: 'Rejected', assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }],
    ]);
    await expect(
      service.rejectTicket(9, MEO_OFFICER as AdminSession, 'Reason'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an empty reason', async () => {
    const { service } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }],
    ]);
    await expect(
      service.rejectTicket(9, MEO_OFFICER as AdminSession, '   '),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a reason over TICKET_REJECTION_REASON_MAX_LENGTH', async () => {
    const { service } = makeService([
      [{ status: 'Reported', assigned_office: 'MEO', category: 'Pothole / Road Surface Damage' }],
    ]);
    await expect(
      service.rejectTicket(9, MEO_OFFICER as AdminSession, 'x'.repeat(1001)),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TicketsService.getTicketsForExport', () => {
  function makeService(rows: unknown[]) {
    const sql = ((..._args: unknown[]) => {
      return {
        then(resolve: (v: unknown) => void) {
          void Promise.resolve(rows).then(resolve);
        },
      };
    }) as unknown as Sql;
    return new TicketsService(
      sql,
      {} as MediaService,
      {} as NotificationsService,
      {} as EmailService,
      {} as ConfigService<Env, true>,
      {} as AdminAuditService,
    );
  }

  it('returns the export-shaped rows the query produces', async () => {
    const service = makeService([
      {
        id: 1,
        status: 'Reported',
        assigned_office: 'MEO',
        category: 'Pothole',
        barangay_name: 'Poblacion',
        urgency_band: 'High',
        priority_score: 90,
        member_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const rows = await service.getTicketsForExport({ office: 'MEO' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
    expect(rows[0]).not.toHaveProperty('title');
  });

  it('returns an empty array when nothing matches, rather than throwing', async () => {
    const service = makeService([]);
    await expect(
      service.getTicketsForExport({ office: 'MDRRMO' }),
    ).resolves.toEqual([]);
  });

  it('defaults to no filters when called with no arguments', async () => {
    const service = makeService([]);
    await expect(service.getTicketsForExport()).resolves.toEqual([]);
  });
});

// No DB test harness (see reports.service.spec.ts's comment on this pattern)
// — the disputed filter's office-scoping is enforced by the same
// `filters.office` clause every other filter already goes through, so the
// regression to guard against is a hand-rolled disputed WHERE clause that
// bypasses it, not a logic bug in the clause itself.
describe('getTicketsForAdmin disputed filter wiring', () => {
  const ticketsServiceSource = readFileSync(
    join(__dirname, 'tickets.service.ts'),
    'utf8',
  );

  it('selects disputed_at and narrows on it only when the filter is set', () => {
    expect(ticketsServiceSource).toMatch(
      /SELECT t\.id, t\.category,[\s\S]*?t\.disputed_at,/,
    );
    expect(ticketsServiceSource).toMatch(
      /AND \(\$\{filters\.disputed \? true : null\}::boolean IS NULL OR t\.disputed_at IS NOT NULL\)/,
    );
  });

  it('places the disputed filter alongside (not before) the office-scoping WHERE clause', () => {
    const selectIdx = ticketsServiceSource.indexOf('SELECT t.id, t.category,');
    const officeClauseIdx = ticketsServiceSource.indexOf(
      't.assigned_office = ${filters.office ?? null}::office)',
      selectIdx,
    );
    const disputedClauseIdx = ticketsServiceSource.indexOf(
      't.disputed_at IS NOT NULL)',
      selectIdx,
    );
    expect(officeClauseIdx).toBeGreaterThan(-1);
    expect(disputedClauseIdx).toBeGreaterThan(officeClauseIdx);
  });

  it('getTicketDetail exposes disputed_at and dispute_reason for the admin Ticket Detail page', () => {
    const detailStart = ticketsServiceSource.indexOf('async getTicketDetail(');
    const detailSelect = ticketsServiceSource.slice(
      detailStart,
      ticketsServiceSource.indexOf('FROM tickets t', detailStart),
    );
    expect(detailSelect).toContain('t.disputed_at');
    expect(detailSelect).toContain('t.dispute_reason');
  });
});

// Same no-DB source-scan approach as the disputed wiring above. The guard is
// that the categoryReview filter rides the same office-scoped WHERE in both
// the queue list and the CSV export (which reuses parseTicketQuery), and that
// the flag is returned to the queue row and Ticket Detail.
describe('categoryReview filter wiring', () => {
  const ticketsServiceSource = readFileSync(
    join(__dirname, 'tickets.service.ts'),
    'utf8',
  );
  const CLAUSE =
    'AND (${filters.categoryReview ? true : null}::boolean IS NULL OR t.category_review_required)';

  function methodBody(name: string, endMarker: string): string {
    const start = ticketsServiceSource.indexOf(`async ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return ticketsServiceSource.slice(
      start,
      ticketsServiceSource.indexOf(endMarker, start),
    );
  }

  it('getTicketsForAdmin selects category_review_required and narrows on it after the office clause', () => {
    const body = methodBody('getTicketsForAdmin', 'ORDER BY ${orderBy}');
    expect(body).toContain('t.category_review_required,');
    const officeIdx = body.indexOf(
      't.assigned_office = ${filters.office ?? null}::office)',
    );
    expect(officeIdx).toBeGreaterThan(-1);
    expect(body.indexOf(CLAUSE)).toBeGreaterThan(officeIdx);
  });

  it('getTicketsForExport applies the same clause after the office clause', () => {
    const body = methodBody('getTicketsForExport', 'LIMIT 5000');
    const officeIdx = body.indexOf(
      't.assigned_office = ${filters.office ?? null}::office)',
    );
    expect(officeIdx).toBeGreaterThan(-1);
    expect(body.indexOf(CLAUSE)).toBeGreaterThan(officeIdx);
  });

  it('getTicketDetail exposes category_review_required', () => {
    const detailStart = ticketsServiceSource.indexOf('async getTicketDetail(');
    const detailSelect = ticketsServiceSource.slice(
      detailStart,
      ticketsServiceSource.indexOf('FROM tickets t', detailStart),
    );
    expect(detailSelect).toContain('t.category_review_required');
  });
});

describe('ticket-status notification email selection', () => {
  const ticketsServiceSource = readFileSync(
    join(__dirname, 'tickets.service.ts'),
    'utf8',
  );

  it('keeps advanceStatus email delivery post-commit and limited to resolved tickets', () => {
    expect(ticketsServiceSource).toMatch(
      /return nextStatus === 'Resolved'\s*\n\s*\? citizenRows/,
    );
    expect(ticketsServiceSource).toMatch(
      /const emailRecipients = await sql\.begin[\s\S]*?if \(emailRecipients\.length > 0\)/,
    );
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportResolved/);
  });

  it('sends the rejection email from rejectTicket, not advanceStatus', () => {
    const advanceStatusBody = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async advanceStatus('),
      ticketsServiceSource.indexOf('async reassignOffice('),
    );
    expect(advanceStatusBody).not.toMatch(/sendReportRejected/);
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportRejected/);
  });

  it('does not add email delivery to routine in-app-only status updates', () => {
    expect(ticketsServiceSource).not.toMatch(/sendReportReceived/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketUnderReview/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketInProgress/);
  });
});

// Manuscript revision Phase 2, step 2b (Appendix H): resolving through the
// status ladder records the MUNICIPAL_ACTION_COMPLETED outcome in the same
// UPDATE; the other transitions and rejecting leave it untouched (NULL).
// Same fake client as the audit-logging block above, except that it also
// records each query's text and values.
describe('resolution_outcome on status changes (Phase 2, step 2b)', () => {
  function makeRecordingService(rows: unknown[][]) {
    const calls: { text: string; values: unknown[] }[] = [];
    let i = 0;
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values });
      return {
        then(resolve: (v: unknown) => void) {
          void Promise.resolve(rows[i++] ?? []).then(resolve);
        },
      };
    }) as unknown as Sql;
    (
      sql as unknown as {
        begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
      }
    ).begin = (cb) => cb(sql);
    const service = new TicketsService(
      sql,
      {} as MediaService,
      { createInTx: jest.fn() } as unknown as NotificationsService,
      {
        sendReportResolved: jest.fn(),
        sendReportRejected: jest.fn(),
      } as unknown as EmailService,
      {
        get: jest.fn().mockReturnValue('https://porac.example'),
      } as unknown as ConfigService<Env, true>,
      {
        logInPgTx: jest.fn().mockResolvedValue(undefined),
      } as unknown as AdminAuditService,
    );
    const ticketUpdate = () => {
      const update = calls.find((c) => c.text.includes('UPDATE tickets'));
      if (!update) throw new Error('no UPDATE tickets query was issued');
      return update;
    };
    return { service, ticketUpdate };
  }

  it('sets MUNICIPAL_ACTION_COMPLETED in the same UPDATE that resolves the ticket', async () => {
    const { service, ticketUpdate } = makeRecordingService([
      [
        {
          status: 'In Progress',
          assigned_office: 'MEO',
          category: 'Streetlight Out',
        },
      ], // ticket lookup
      [{}], // UPDATE tickets
      [{}], // INSERT status_history
      [], // citizenRows (no notification recipients)
    ]);

    const result = await service.advanceStatus(
      7,
      MEO_OFFICER as AdminSession,
      'Lamp replaced.',
      undefined,
    );

    expect(result).toEqual({ status: 'Resolved' });
    const update = ticketUpdate();
    expect(update.text).toMatch(
      /resolution_outcome = COALESCE\(\?::resolution_outcome, resolution_outcome\)/,
    );
    expect(update.values).toContain('Resolved');
    expect(update.values).toContain('MUNICIPAL_ACTION_COMPLETED');
  });

  it.each([
    ['Reported', 'Under Review'],
    ['Under Review', 'In Progress'],
  ])(
    'leaves resolution_outcome as it was when advancing %s to %s',
    async (from, to) => {
      const { service, ticketUpdate } = makeRecordingService([
        [{ status: from, assigned_office: 'MEO', category: 'Streetlight Out' }],
        [{}],
        [{}],
        [],
      ]);

      await service.advanceStatus(
        7,
        MEO_OFFICER as AdminSession,
        undefined,
        undefined,
      );

      const update = ticketUpdate();
      expect(update.values).toContain(to);
      expect(update.values).not.toContain('MUNICIPAL_ACTION_COMPLETED');
    },
  );

  it('rejecting a ticket never writes resolution_outcome, so it stays NULL', async () => {
    const { service, ticketUpdate } = makeRecordingService([
      [
        {
          status: 'Reported',
          assigned_office: 'MEO',
          category: 'Streetlight Out',
        },
      ],
      [{}],
      [{}],
      [],
    ]);

    await service.rejectTicket(
      9,
      MEO_OFFICER as AdminSession,
      'Duplicate of an earlier report.',
    );

    const update = ticketUpdate();
    expect(update.text).toContain("status = 'Rejected'");
    expect(update.text).not.toContain('resolution_outcome');
  });

  it('getTicketDetail selects initial_assigned_office and resolution_outcome, and each report its tracking_reference', () => {
    const source = readFileSync(join(__dirname, 'tickets.service.ts'), 'utf8');
    const detailStart = source.indexOf('async getTicketDetail(');
    const detailSelect = source.slice(
      detailStart,
      source.indexOf('FROM tickets t', detailStart),
    );
    expect(detailSelect).toContain('t.initial_assigned_office');
    expect(detailSelect).toContain('t.resolution_outcome');
    const reportsStart = source.indexOf(
      'const reports = await sql<TicketReport[]>',
      detailStart,
    );
    const reportsSelect = source.slice(
      reportsStart,
      source.indexOf('FROM reports WHERE ticket_id', reportsStart),
    );
    expect(reportsSelect).toContain('tracking_reference');
  });
});

// Manuscript revision Phase 2, step 2c (Appendix H ROUTING_ACTIONS): every
// office_reassignments insert and every ticket_referral_noted audit event is
// joined by one routing_actions row in the same transaction. Same fake client
// as the blocks above; it also records each query's text, values, and
// whether it ran inside the sql.begin callback. An Error in `rows` makes
// that query reject.
describe('routing_actions dual-write (Phase 2, step 2c)', () => {
  const MEO_ADMIN = {
    adminId: 4,
    adminName: 'Maria Santos',
    email: 'maria@porac.gov.ph',
    role: 'officer',
    office: 'MEO',
  } as AdminSession;
  const FOCAL_ADMIN = {
    adminId: 9,
    adminName: 'Diana Torres',
    email: 'focal@porac.gov.ph',
    role: 'focal',
    office: 'MDRRMO',
  } as AdminSession;

  function makeRecordingService(rows: unknown[]) {
    const calls: { text: string; values: unknown[]; inTx: boolean }[] = [];
    let i = 0;
    let inTx = false;
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join('?'), values, inTx });
      const row = rows[i++] ?? [];
      return {
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          if (row instanceof Error) reject(row);
          else void Promise.resolve(row).then(resolve);
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
    const service = new TicketsService(
      sql,
      {} as MediaService,
      { createInTx: jest.fn() } as unknown as NotificationsService,
      {} as EmailService,
      {} as ConfigService<Env, true>,
      { logInPgTx } as unknown as AdminAuditService,
    );
    const routingInserts = () =>
      calls.filter((c) => c.text.includes('INSERT INTO routing_actions'));
    return { service, calls, routingInserts };
  }

  it('reassignOffice writes exactly one REASSIGN row, in the same transaction as office_reassignments', async () => {
    const { service, calls, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MEO', category: 'Pothole', status: 'In Progress' }], // ticket lookup
      [{}], // UPDATE tickets
      [{}], // INSERT office_reassignments
      [{}], // INSERT routing_actions
    ]);

    await service.reassignOffice(21, MEO_ADMIN, 'MDRRMO');

    const inserts = routingInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].inTx).toBe(true);
    expect(inserts[0].text).toContain("'REASSIGN'");
    expect(inserts[0].text).toMatch(/now\(\)\s*\)\s*$/);
    expect(inserts[0].values).toEqual([
      21,
      'MEO',
      'MDRRMO',
      ROUTING_REASON_NOT_RECORDED,
      4,
      'Maria Santos',
      ROUTING_ADMIN_NAME_MAX_LENGTH,
    ]);
    const reassignment = calls.find((c) =>
      c.text.includes('INSERT INTO office_reassignments'),
    );
    expect(reassignment?.inTx).toBe(true);
    expect(reassignment?.values).toEqual([
      21,
      'MEO',
      'MDRRMO',
      4,
      'Maria Santos',
    ]);
  });

  it("Focal's Forward (same reassignOffice path) writes one REASSIGN row too", async () => {
    const { service, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MEO', category: 'Pothole', status: 'Reported' }], // ticket lookup
      [{ count: 0 }], // active work-order count
      [{}], // UPDATE tickets
      [{}], // INSERT office_reassignments
      [{}], // INSERT routing_actions
    ]);

    await service.reassignOffice(22, FOCAL_ADMIN, 'MDRRMO');

    const inserts = routingInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].inTx).toBe(true);
    expect(inserts[0].values).toEqual([
      22,
      'MEO',
      'MDRRMO',
      ROUTING_REASON_NOT_RECORDED,
      9,
      'Diana Torres',
      ROUTING_ADMIN_NAME_MAX_LENGTH,
    ]);
  });

  it('a reassign rejected before the transaction writes no routing row', async () => {
    const { service, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MDRRMO', category: 'Pothole', status: 'Reported' }],
    ]);

    await expect(
      service.reassignOffice(23, MEO_ADMIN, 'MDRRMO'),
    ).rejects.toThrow(ForbiddenException);
    expect(routingInserts()).toHaveLength(0);
  });

  it('a reassign whose office_reassignments insert fails writes no routing row (the transaction rolls back)', async () => {
    const { service, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MEO', category: 'Pothole', status: 'In Progress' }],
      [{}], // UPDATE tickets
      new Error('insert failed'), // INSERT office_reassignments
    ]);

    await expect(
      service.reassignOffice(24, MEO_ADMIN, 'MDRRMO'),
    ).rejects.toThrow('insert failed');
    expect(routingInserts()).toHaveLength(0);
  });

  it('logReferral writes exactly one REFER row in its transaction, with the note as the reason', async () => {
    const { service, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MEO', category: 'Leaking Pipe' }], // ticket lookup
      [{}], // INSERT routing_actions
    ]);

    await service.logReferral(
      31,
      MEO_ADMIN,
      'Water district',
      '  Called the hotline  ',
    );

    const inserts = routingInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].inTx).toBe(true);
    expect(inserts[0].text).toMatch(/'REFER', \?, NULL, \?/);
    expect(inserts[0].values).toEqual([
      31,
      'MEO', // from_office: the ticket's current office
      'Water district', // referral_target: the agency as stored in the audit metadata
      'Called the hotline',
      4,
      'Maria Santos',
      ROUTING_ADMIN_NAME_MAX_LENGTH,
    ]);
  });

  it.each([
    ['a blank note', '   '],
    ['no note', undefined],
  ])(
    'logReferral with %s records the not-recorded reason',
    async (_label, note) => {
      const { service, routingInserts } = makeRecordingService([
        [{ assigned_office: 'MDRRMO', category: 'Leaking Pipe' }],
        [{}],
      ]);

      await service.logReferral(
        32,
        { ...MEO_ADMIN, office: 'MDRRMO' },
        'MENRO',
        note,
      );

      expect(routingInserts()).toHaveLength(1);
      expect(routingInserts()[0].values[3]).toBe(ROUTING_REASON_NOT_RECORDED);
    },
  );

  it('caps the admin name at the varchar(100) limit in SQL, for both inserts', async () => {
    const { service, routingInserts } = makeRecordingService([
      [{ assigned_office: 'MEO', category: 'Pothole', status: 'In Progress' }],
      [{}],
      [{}],
      [{}],
      [{ assigned_office: 'MDRRMO', category: 'Leaking Pipe' }],
      [{}],
    ]);

    await service.reassignOffice(34, MEO_ADMIN, 'MDRRMO');
    await service.logReferral(
      34,
      { ...MEO_ADMIN, office: 'MDRRMO' },
      'MENRO',
      undefined,
    );

    const inserts = routingInserts();
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.text).toContain('left(?::text, ?::int)');
      expect(insert.values.at(-1)).toBe(ROUTING_ADMIN_NAME_MAX_LENGTH);
    }
  });

  it('migration 0037 backfills with the same not-recorded text as the app', () => {
    const migration = readFileSync(
      join(__dirname, '..', '..', 'drizzle', '0037_routing_actions.sql'),
      'utf8',
    );
    // The REASSIGN and REFER backfills.
    expect(migration.split(`'${ROUTING_REASON_NOT_RECORDED}'`).length - 1).toBe(
      2,
    );
  });
});
