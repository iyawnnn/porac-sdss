import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql } from 'postgres';
import type { ConfigService } from '@nestjs/config';
import type { AdminSession } from '../auth/session.service';
import type { WeatherService } from '../domain/weather.service';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import type { AdminAuditService } from './admin-audit.service';
import { TicketsService } from './tickets.service';

// The Precision Queue rebuild's two new server behaviours: the view-tab counts
// and the bulk actions. Kept out of tickets.service.spec.ts only because that
// file is already 600 lines; the mocking idiom (a callable stub standing in for
// postgres.js's tagged template, plus source-text assertions for properties
// that are about *how* a query is written) is the same one used there.
const ticketsServiceSource = readFileSync(
  join(__dirname, 'tickets.service.ts'),
  'utf8',
);

const MEO_OFFICER = { role: 'officer', office: 'MEO' } as Pick<
  AdminSession,
  'role' | 'office'
>;
const MDRRMO_SUPERVISOR = { role: 'supervisor', office: 'MDRRMO' } as Pick<
  AdminSession,
  'role' | 'office'
>;
const SYSTEM_ADMIN = { role: 'system_admin', office: null } as Pick<
  AdminSession,
  'role' | 'office'
>;

function buildService(sql: Sql): TicketsService {
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

describe('TicketsService.getViewCounts office scoping', () => {
  // Captures the values postgres.js would bind, so the assertion is about what
  // actually reaches the WHERE clause rather than about a live database.
  function makeService(row: Record<string, number> | undefined) {
    const calls: unknown[][] = [];
    const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(values);
      return {
        then(resolve: (v: unknown) => void) {
          void Promise.resolve(row ? [row] : []).then(resolve);
        },
      };
    }) as unknown as Sql;
    return { service: buildService(sql), calls };
  }

  const ROW = {
    all_active: 159,
    high_urgency: 4,
    disputed: 1,
    meo: 159,
    mdrrmo: 0,
  };

  // The office value is bound twice in the disputed subquery's own IS
  // NULL/equality test, then twice more in the outer WHERE's — four total,
  // so both places stay RBAC-scoped to the caller's office.
  it("binds an office admin's own office, so counts can never span both offices", async () => {
    const { service, calls } = makeService(ROW);
    await service.getViewCounts(MEO_OFFICER);
    expect(calls[0]).toEqual(['MEO', 'MEO', 'MEO', 'MEO']);
  });

  it('clamps an MDRRMO supervisor to MDRRMO', async () => {
    const { service, calls } = makeService(ROW);
    await service.getViewCounts(MDRRMO_SUPERVISOR);
    expect(calls[0]).toEqual(['MDRRMO', 'MDRRMO', 'MDRRMO', 'MDRRMO']);
  });

  it('binds null for a system admin, which is what widens the counts city-wide', async () => {
    const { service, calls } = makeService(ROW);
    await service.getViewCounts(SYSTEM_ADMIN);
    expect(calls[0]).toEqual([null, null, null, null]);
  });

  it('maps the snake_case aggregate onto the camelCase response', async () => {
    const { service } = makeService(ROW);
    await expect(service.getViewCounts(SYSTEM_ADMIN)).resolves.toEqual({
      allActive: 159,
      highUrgency: 4,
      disputed: 1,
      meo: 159,
      mdrrmo: 0,
    });
  });

  it('returns zeros rather than undefined when the aggregate yields no row', async () => {
    const { service } = makeService(undefined);
    await expect(service.getViewCounts(SYSTEM_ADMIN)).resolves.toEqual({
      allActive: 0,
      highUrgency: 0,
      disputed: 0,
      meo: 0,
      mdrrmo: 0,
    });
  });

  // If this ever becomes a priority_score comparison, the High urgency tab will
  // advertise a number the list it opens disagrees with — the urgency filter
  // matches urgency_band, so the count has to as well.
  it('counts High urgency off urgency_band, the column the urgency filter matches', () => {
    const body = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getViewCounts('),
      ticketsServiceSource.indexOf('async getTicketsForExport('),
    );
    expect(body).toMatch(/urgency_band = 'High'/);
    expect(body).not.toMatch(/priority_score\s*>=/);
  });

  it('counts only the active statuses, matching what the All active tab opens', () => {
    const body = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getViewCounts('),
      ticketsServiceSource.indexOf('async getTicketsForExport('),
    );
    expect(body).toMatch(
      /status IN \('Reported', 'Under Review', 'In Progress'\)/,
    );
  });

  // Regression guard: a dispute can only ever exist on a Resolved ticket
  // (ReportsService.disputeReport requires it), so the disputed count must
  // never be filtered by the same active-status WHERE the other four
  // columns use — that combination is impossible to satisfy and always
  // returns zero, which is exactly the bug this guards against.
  it('counts disputed tickets independently of the active-status filter', async () => {
    const { service } = makeService({ ...ROW, disputed: 3 });
    await expect(service.getViewCounts(SYSTEM_ADMIN)).resolves.toMatchObject({
      disputed: 3,
    });

    const body = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getViewCounts('),
      ticketsServiceSource.indexOf('async getTicketsForExport('),
    );
    const disputedSubquery = body.slice(
      body.indexOf('SELECT COUNT(*)::int FROM tickets t2'),
      body.indexOf(') AS disputed'),
    );
    expect(disputedSubquery).not.toMatch(
      /status IN \('Reported', 'Under Review', 'In Progress'\)/,
    );
  });
});

describe('TicketsService.bulkAdvanceStatus eligibility', () => {
  // advanceStatus is stubbed on purpose: this suite is about which ids reach it,
  // which is the whole safety property. A ticket whose next status is Resolved
  // must be filtered out BEFORE the call, because only the detail page can
  // collect the proof photo that transition requires.
  function makeService(rows: { id: number; status: string }[]) {
    const sql = (() => ({
      then(resolve: (v: unknown) => void) {
        void Promise.resolve(rows).then(resolve);
      },
    })) as unknown as Sql;
    const service = buildService(sql);
    const advanceStatus = jest
      .spyOn(service, 'advanceStatus')
      .mockResolvedValue({ status: 'Under Review' } as never);
    return { service, advanceStatus };
  }

  const ADMIN = { role: 'system_admin', office: null } as AdminSession;

  it('skips a ticket bound for Resolved instead of resolving it with no photo', async () => {
    const { service, advanceStatus } = makeService([
      { id: 1, status: 'In Progress' },
    ]);
    const result = await service.bulkAdvanceStatus([1], ADMIN);
    expect(advanceStatus).not.toHaveBeenCalled();
    expect(result.ok).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ id: 1 });
    expect(result.skipped[0].reason).toMatch(/proof photo/);
  });

  it('skips terminal statuses with no transition left', async () => {
    const { service, advanceStatus } = makeService([
      { id: 2, status: 'Resolved' },
      { id: 3, status: 'Rejected' },
    ]);
    const result = await service.bulkAdvanceStatus([2, 3], ADMIN);
    expect(advanceStatus).not.toHaveBeenCalled();
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'Already Resolved — no transition available.',
      'Already Rejected — no transition available.',
    ]);
  });

  it('reports an id the query did not return as not found', async () => {
    const { service } = makeService([]);
    const result = await service.bulkAdvanceStatus([999], ADMIN);
    expect(result.skipped).toEqual([{ id: 999, reason: 'Ticket not found.' }]);
  });

  it('advances only the eligible ids and reports both halves of a mixed batch', async () => {
    const { service, advanceStatus } = makeService([
      { id: 4, status: 'Reported' },
      { id: 5, status: 'In Progress' },
      { id: 6, status: 'Under Review' },
    ]);
    const result = await service.bulkAdvanceStatus([4, 5, 6], ADMIN);
    expect(advanceStatus.mock.calls.map((c) => c[0])).toEqual([4, 6]);
    expect(result.ok).toEqual([4, 6]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe(5);
  });

  // One ticket owned by another office must not roll back the twenty that
  // succeeded — each single-ticket call has its own transaction.
  it('records a per-ticket failure as skipped rather than failing the batch', async () => {
    const { service, advanceStatus } = makeService([
      { id: 7, status: 'Reported' },
      { id: 8, status: 'Reported' },
    ]);
    advanceStatus.mockReset();
    advanceStatus
      .mockRejectedValueOnce(
        new ForbiddenException("You do not have access to this office's data."),
      )
      .mockResolvedValueOnce({ status: 'Under Review' } as never);
    const result = await service.bulkAdvanceStatus([7, 8], ADMIN);
    expect(result.ok).toEqual([8]);
    expect(result.skipped[0].id).toBe(7);
    expect(result.skipped[0].reason).toMatch(/do not have access/);
  });

  it('never passes an image buffer through — bulk cannot carry a photo', () => {
    const body = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async bulkAdvanceStatus('),
      ticketsServiceSource.indexOf('async bulkReassign('),
    );
    expect(body).toMatch(
      /this\.advanceStatus\(id, admin, undefined, undefined\)/,
    );
  });
});

describe('TicketsService.bulkReassign', () => {
  function makeService() {
    const service = buildService((() => ({
      then(resolve: (v: unknown) => void) {
        void Promise.resolve([]).then(resolve);
      },
    })) as unknown as Sql);
    const reassignOffice = jest
      .spyOn(service, 'reassignOffice')
      .mockResolvedValue({ assignedOffice: 'MDRRMO' });
    return { service, reassignOffice };
  }

  const ADMIN = { role: 'system_admin', office: null } as AdminSession;

  it('delegates every id to reassignOffice', async () => {
    const { service, reassignOffice } = makeService();
    const result = await service.bulkReassign([10, 11], ADMIN, 'MDRRMO');
    expect(reassignOffice.mock.calls.map((c) => c[0])).toEqual([10, 11]);
    expect(result.ok).toEqual([10, 11]);
    expect(result.skipped).toEqual([]);
  });

  it('surfaces an already-on-that-office rejection as a skip, not a thrown error', async () => {
    const { service, reassignOffice } = makeService();
    reassignOffice.mockReset();
    reassignOffice.mockRejectedValueOnce(
      new Error('Ticket is already assigned to MDRRMO'),
    );
    const result = await service.bulkReassign([12], ADMIN, 'MDRRMO');
    expect(result.ok).toEqual([]);
    expect(result.skipped).toEqual([
      { id: 12, reason: 'Ticket is already assigned to MDRRMO' },
    ]);
  });
});

// The entire authorization and audit story for bulk work rests on this: the
// bulk methods must LOOP the per-ticket method (which does assertOfficeAccess,
// status_history, the audit row and the citizen notification), never issue
// their own wide UPDATE. A set-based rewrite would be faster and would silently
// become a second authorization path with no audit trail.
describe('bulk actions delegate rather than re-implementing', () => {
  const bulkSection = ticketsServiceSource.slice(
    ticketsServiceSource.indexOf('private async runBulk('),
  );

  it('bulkReassign calls reassignOffice', () => {
    expect(bulkSection).toMatch(/this\.reassignOffice\(id, admin, toOffice\)/);
  });

  it('writes no ticket UPDATE of its own', () => {
    expect(bulkSection).not.toMatch(/UPDATE tickets/);
  });

  it('does not call the audit logger directly', () => {
    expect(bulkSection).not.toMatch(/this\.audit\./);
  });

  it('does not insert status_history directly', () => {
    expect(bulkSection).not.toMatch(/INSERT INTO status_history/);
  });
});

// Nest matches routes in declaration order, and 'bulk/reassign' matches the
// pattern ':id/reassign' with :id = 'bulk'. That resolves to ParseIntPipe and
// fails with "numeric string is expected" instead of reaching the bulk handler
// — a bug this codebase actually shipped for one commit. A literal segment does
// not win over a parameter by being more specific; only order decides.
describe('bulk route declaration order', () => {
  const controllerSource = readFileSync(
    join(__dirname, 'tickets.controller.ts'),
    'utf8',
  );

  it("declares bulk/reassign before the ':id/reassign' route", () => {
    expect(controllerSource.indexOf("@Post('bulk/reassign')")).toBeGreaterThan(
      -1,
    );
    expect(controllerSource.indexOf("@Post('bulk/reassign')")).toBeLessThan(
      controllerSource.indexOf("@Post(':id/reassign')"),
    );
  });

  it("declares bulk/advance-status before every ':id/...' POST route", () => {
    const bulkIndex = controllerSource.indexOf("@Post('bulk/advance-status')");
    expect(bulkIndex).toBeGreaterThan(-1);
    for (const route of [
      "@Post(':id/status')",
      "@Post(':id/reassign')",
      "@Post(':id/refer')",
      "@Post(':id/reject')",
    ]) {
      expect(bulkIndex).toBeLessThan(controllerSource.indexOf(route));
    }
  });
});
