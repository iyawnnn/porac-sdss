import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import type { Sql } from 'postgres';
import type { ConfigService } from '@nestjs/config';
import type { AdminSession } from '../auth/session.service';
import type { WeatherService } from '../domain/weather.service';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import type { AdminAuditService } from './admin-audit.service';
import { readFileSync } from 'fs';
import { join } from 'path';

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
    {} as WeatherService,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );

  it.each(['Flooding', 'Pothole', 'Other'])(
    'accepts a known category %s',
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
    {} as WeatherService,
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

  it('defaults a system admin to city-wide (no office filter)', () => {
    expect(service.parseTicketQuery({}, SYSTEM_ADMIN).office).toBeUndefined();
    expect(
      service.parseTicketQuery({ office: 'all' }, SYSTEM_ADMIN).office,
    ).toBeUndefined();
  });

  it('lets a system admin request a specific office', () => {
    expect(
      service.parseTicketQuery({ office: 'MDRRMO' }, SYSTEM_ADMIN).office,
    ).toBe('MDRRMO');
  });
});

describe('parseTicketQuery disputed filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as WeatherService,
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
      {} as WeatherService,
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

  it("allows a system admin to view any office's ticket detail", async () => {
    const service = makeService([
      [{ id: 1, assigned_office: 'MDRRMO' }],
      [],
      [],
      [],
    ]);
    const detail = await service.getTicketDetail(1, SYSTEM_ADMIN);
    expect(detail?.ticket.assigned_office).toBe('MDRRMO');
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
    const service = new TicketsService(
      sql,
      {} as WeatherService,
      {} as MediaService,
      { createInTx: jest.fn() } as unknown as NotificationsService,
      {} as EmailService,
      {} as ConfigService<Env, true>,
      audit,
    );
    return { service, logInPgTx };
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
      {} as WeatherService,
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

describe('ticket-status notification email selection', () => {
  const ticketsServiceSource = readFileSync(
    join(__dirname, 'tickets.service.ts'),
    'utf8',
  );

  it('keeps email delivery post-commit and limited to resolved/rejected tickets', () => {
    expect(ticketsServiceSource).toMatch(
      /return nextStatus === 'Resolved' \|\| nextStatus === 'Rejected'/,
    );
    expect(ticketsServiceSource).toMatch(
      /const emailRecipients = await sql\.begin[\s\S]*?if \(emailRecipients\.length > 0\)/,
    );
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportResolved/);
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportRejected/);
  });

  it('does not add email delivery to routine in-app-only status updates', () => {
    expect(ticketsServiceSource).not.toMatch(/sendReportReceived/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketUnderReview/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketInProgress/);
  });
});
