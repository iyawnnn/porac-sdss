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

  // Batch 1 (five-role RBAC): system_admin no longer has routine
  // operational access — resolveOfficeScope now rejects it outright rather
  // than widening to city-wide. See admin-scope.spec.ts for the helper's
  // own tests; this is the regression guard at the consuming service.
  it('rejects a system admin outright rather than widening the counts city-wide', async () => {
    const { service } = makeService(ROW);
    await expect(service.getViewCounts(SYSTEM_ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('maps the snake_case aggregate onto the camelCase response', async () => {
    const { service } = makeService(ROW);
    await expect(service.getViewCounts(MEO_OFFICER)).resolves.toEqual({
      allActive: 159,
      disputed: 1,
      meo: 159,
      mdrrmo: 0,
    });
  });

  it('returns zeros rather than undefined when the aggregate yields no row', async () => {
    const { service } = makeService(undefined);
    await expect(service.getViewCounts(MEO_OFFICER)).resolves.toEqual({
      allActive: 0,
      disputed: 0,
      meo: 0,
      mdrrmo: 0,
    });
  });

  // Manuscript revision Phase 1, step 4: the High urgency tab and its count
  // are gone, so the counts query must not read any Hazard Urgency column.
  it('no longer counts anything off a Hazard Urgency column', () => {
    const body = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getViewCounts('),
      ticketsServiceSource.indexOf('async getTicketsForExport('),
    );
    expect(body).not.toMatch(/urgency_band|urgency_level|priority_score/);
    expect(body).not.toMatch(/high_urgency/);
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
    await expect(service.getViewCounts(MEO_OFFICER)).resolves.toMatchObject({
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

// The queue's default sort is Operational Priority (priority_index)
// descending (Batch 4). Manuscript revision Phase 1, step 4 retired the
// Hazard Urgency sorts ('priority_desc'/'priority_asc') and the urgency
// filter: an old URL that still carries them falls back to the default order
// with no urgency filter, and stored saved views were rewritten by
// drizzle/0034_saved_views_retire_hazard_urgency.sql.
describe('TicketsService.parseTicketQuery default sort', () => {
  const service = buildService(jest.fn() as unknown as Sql);

  it('defaults to Operational Priority descending when no sort is given', () => {
    const filters = service.parseTicketQuery({}, MEO_OFFICER);
    expect(filters.sort).toBe('op_priority_desc');
  });

  it('defaults to Operational Priority descending on an unrecognized sort value', () => {
    const filters = service.parseTicketQuery(
      { sort: 'not-a-real-sort' },
      MEO_OFFICER,
    );
    expect(filters.sort).toBe('op_priority_desc');
  });

  it('falls back to Operational Priority descending for the retired priority_desc sort', () => {
    const filters = service.parseTicketQuery(
      { sort: 'priority_desc' },
      MEO_OFFICER,
    );
    expect(filters.sort).toBe('op_priority_desc');
  });

  it('falls back to Operational Priority descending for the retired priority_asc sort', () => {
    const filters = service.parseTicketQuery(
      { sort: 'priority_asc' },
      MEO_OFFICER,
    );
    expect(filters.sort).toBe('op_priority_desc');
  });

  it('ignores a retired urgency= filter instead of passing it through', () => {
    const filters = service.parseTicketQuery(
      { urgency: 'High', category: 'Streetlight Out' },
      MEO_OFFICER,
    );
    expect(filters).not.toHaveProperty('urgency');
    expect(filters.category).toBe('Streetlight Out');
  });

  it('accepts the new explicit op_priority_asc sort', () => {
    const filters = service.parseTicketQuery(
      { sort: 'op_priority_asc' },
      MEO_OFFICER,
    );
    expect(filters.sort).toBe('op_priority_asc');
  });

  it('accepts newest unchanged', () => {
    const filters = service.parseTicketQuery({ sort: 'newest' }, MEO_OFFICER);
    expect(filters.sort).toBe('newest');
  });
});

describe('TicketsService.getTicketsForAdmin ORDER BY — Operational Priority vs Hazard Urgency', () => {
  it('sorts by priority_index (Operational Priority) by default, not priority_score', () => {
    const defaultBranch = ticketsServiceSource.match(
      /const orderBy =\s*\n([\s\S]*?)\n {4}const search/,
    )?.[1];
    expect(defaultBranch).toBeTruthy();
    // The final (default/fallback) branch of the ternary must reference
    // priority_index, not priority_score.
    const lastLine = defaultBranch?.trim().split('\n').pop()?.trim();
    expect(lastLine).toMatch(/priority_index DESC/);
  });

  it("still supports 'op_priority_asc' as Operational Priority ascending", () => {
    expect(ticketsServiceSource).toMatch(
      /op_priority_asc[\s\S]{0,80}priority_index ASC/,
    );
  });

  it('has no Hazard Urgency (priority_score) order or urgency filter any more', () => {
    const listBody = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getTicketsForAdmin('),
      ticketsServiceSource.indexOf('async getViewCounts('),
    );
    expect(listBody).not.toMatch(/priority_score/);
    expect(listBody).not.toMatch(/urgency_band|urgency_score|urgency_level/);
    expect(listBody).not.toMatch(/filters\.urgency/);
  });

  it('the CSV export query selects Operational Priority and no Hazard Urgency column', () => {
    const exportBody = ticketsServiceSource.slice(
      ticketsServiceSource.indexOf('async getTicketsForExport('),
      ticketsServiceSource.indexOf('async getTicketsGeo('),
    );
    expect(exportBody).toMatch(/t\.priority_index/);
    expect(exportBody).not.toMatch(
      /priority_score|urgency_band|filters\.urgency/,
    );
  });
});
