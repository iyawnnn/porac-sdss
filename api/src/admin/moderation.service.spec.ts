import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';
import { ModerationService } from './moderation.service';
import type { AdminSession } from '../auth/session.service';
import type {
  CreateNotificationInput,
  NotificationsService,
} from '../notifications/notifications.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';

const MEO_ADMIN = {
  adminId: 1,
  adminName: 'Admin A',
  office: 'MEO',
  role: 'officer',
} as AdminSession;
const MDRRMO_ADMIN = {
  adminId: 2,
  adminName: 'Admin B',
  office: 'MDRRMO',
  role: 'supervisor',
} as AdminSession;
const SYSTEM_ADMIN = {
  adminId: 3,
  adminName: 'Sys Admin',
  office: null,
  role: 'system_admin',
} as AdminSession;

// Captures the mock as a local, typed function rather than reading it back
// off `notifications.createInTx` at assertion time — the latter trips
// @typescript-eslint/unbound-method (a bare method reference pulled off an
// object loses its `this` binding) even though jest.fn() doesn't use `this`.
function makeNotificationsMock() {
  const createInTx = jest.fn<
    Promise<void>,
    [TransactionSql, CreateNotificationInput]
  >();
  const notifications = { createInTx } as unknown as NotificationsService;
  return { notifications, createInTx };
}

function makeAuditMock() {
  const logInPgTx = jest.fn<
    Promise<void>,
    [TransactionSql, LogAdminAuditInput]
  >();
  const audit = { logInPgTx } as unknown as AdminAuditService;
  return { audit, logInPgTx };
}

// Minimal fake postgres.js client: each tagged-template call consumes the
// next queued response in order, and `.begin` just invokes the callback
// with the same fake client (no real transaction semantics needed here —
// moderateReport's atomicity comes from the single guarded UPDATE, which
// this mock exercises row-by-row exactly as production code calls it).
// Nested fragments (e.g. `const statusClause = sql\`AND ...\`` embedded via
// `${statusClause}` in an outer query) must NOT consume a queued response —
// only a top-level, actually-awaited call does. Returning a thenable (not a
// resolved Promise) means a fragment used purely as an interpolation value
// is never `.then()`-ed and so never advances the queue, matching real
// postgres.js's lazy-fragment semantics.
function makeFakeSql(responses: unknown[][]) {
  let i = 0;
  const calls: unknown[] = [];
  const fn = ((..._args: unknown[]) => {
    calls.push(_args);
    return {
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        void Promise.resolve(responses[i++] ?? []).then(resolve, reject);
      },
    };
  }) as unknown as Sql;
  (
    fn as unknown as {
      begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
    }
  ).begin = (cb) => cb(fn);
  return { sql: fn, calls };
}

describe('parseModerationQuery', () => {
  const { sql } = makeFakeSql([]);
  const service = new ModerationService(
    sql,
    {} as NotificationsService,
    {} as AdminAuditService,
  );

  it('defaults status to pending when absent', () => {
    expect(service.parseModerationQuery({}, MEO_ADMIN).status).toBe('pending');
  });

  it.each(['pending', 'quarantined', 'dismissed', 'duplicate'])(
    'accepts status %s',
    (status) => {
      expect(service.parseModerationQuery({ status }, MEO_ADMIN).status).toBe(
        status,
      );
    },
  );

  it('accepts the "all" sentinel even though it is not itself an enumerated status', () => {
    expect(
      service.parseModerationQuery({ status: 'all' }, MEO_ADMIN).status,
    ).toBe('all');
  });

  it('falls back to pending for an unknown status', () => {
    expect(
      service.parseModerationQuery({ status: 'bogus' }, MEO_ADMIN).status,
    ).toBe('pending');
  });

  it("defaults office to the admin's own office when no query param given", () => {
    expect(service.parseModerationQuery({}, MEO_ADMIN).office).toBe('MEO');
  });

  it("clamps office to the admin's own office even when office=all is requested", () => {
    expect(
      service.parseModerationQuery({ office: 'all' }, MEO_ADMIN).office,
    ).toBe('MEO');
  });

  it("clamps office to the admin's own office even when a different office is requested", () => {
    expect(
      service.parseModerationQuery({ office: 'MDRRMO' }, MEO_ADMIN).office,
    ).toBe('MEO');
  });

  it('defaults a system admin to city-wide (no office filter)', () => {
    expect(
      service.parseModerationQuery({}, SYSTEM_ADMIN).office,
    ).toBeUndefined();
  });

  it('lets a system admin request a specific office', () => {
    expect(
      service.parseModerationQuery({ office: 'MDRRMO' }, SYSTEM_ADMIN).office,
    ).toBe('MDRRMO');
  });

  it.each([
    'LOCATION_MISMATCH',
    'STALE_PHOTO',
    'NO_EXIF',
    'DUPLICATE_IMAGE',
    'BOUNDARY_FALLBACK',
  ])('accepts a known flag type %s', (flag) => {
    expect(service.parseModerationQuery({ flag }, MEO_ADMIN).flag).toBe(flag);
  });

  it('rejects an unknown flag type', () => {
    expect(
      service.parseModerationQuery({ flag: 'NOT_A_FLAG' }, MEO_ADMIN).flag,
    ).toBeUndefined();
  });

  it('rejects an unknown category', () => {
    expect(
      service.parseModerationQuery(
        { category: 'Not A Real Category' },
        MEO_ADMIN,
      ).category,
    ).toBeUndefined();
  });

  it('accepts a known category', () => {
    expect(
      service.parseModerationQuery({ category: 'Pothole' }, MEO_ADMIN).category,
    ).toBe('Pothole');
  });

  it('parses barangayId, search, from, to as provided', () => {
    const filters = service.parseModerationQuery(
      {
        barangayId: '7',
        search: 'flood',
        from: '2026-01-01',
        to: '2026-01-31',
      },
      MEO_ADMIN,
    );
    expect(filters.barangayId).toBe(7);
    expect(filters.search).toBe('flood');
    expect(filters.from).toBe('2026-01-01');
    expect(filters.to).toBe('2026-01-31');
  });

  it('clamps page to a minimum of 1', () => {
    expect(service.parseModerationQuery({ page: '0' }, MEO_ADMIN).page).toBe(1);
    expect(service.parseModerationQuery({ page: '-5' }, MEO_ADMIN).page).toBe(
      1,
    );
  });

  it('falls back to the default page limit for an invalid limit', () => {
    expect(
      service.parseModerationQuery({ limit: '999' }, MEO_ADMIN).limit,
    ).toBe(15);
  });
});

describe('getModerationQueue pagination', () => {
  it('computes totalPages from the row-carried total_count', async () => {
    const rows = [
      { id: 1, total_count: 42 },
      { id: 2, total_count: 42 },
    ];
    const { sql } = makeFakeSql([rows]);
    const service = new ModerationService(
      sql,
      {} as NotificationsService,
      {} as AdminAuditService,
    );

    const result = await service.getModerationQueue({ page: 1, limit: 10 });

    expect(result.total).toBe(42);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(5);
    expect(result.reports).toHaveLength(2);
  });

  it('reports total 0 and totalPages 1 when nothing matches', async () => {
    const { sql } = makeFakeSql([[]]);
    const service = new ModerationService(
      sql,
      {} as NotificationsService,
      {} as AdminAuditService,
    );

    const result = await service.getModerationQueue({ page: 1, limit: 10 });

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.reports).toEqual([]);
  });
});

describe('moderateReport transitions', () => {
  it('dismiss requires no note and sends no notification', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
      [{ ticket_id: 5, citizen_id: 9, title: 'Pothole on Main St' }], // UPDATE reports
    ]);
    const { notifications, createInTx } = makeNotificationsMock();
    const { audit, logInPgTx } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    const result = await service.moderateReport(1, 'dismiss', MEO_ADMIN);

    expect(result.status).toBe('dismissed');
    expect(createInTx).not.toHaveBeenCalled();
    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, input] = logInPgTx.mock.calls[0];
    expect(input.actionType).toBe('report_moderated');
    expect(input.targetType).toBe('report');
    expect(input.targetId).toBe(1);
    expect(input.metadata).toEqual({ action: 'dismiss', note: null });
  });

  it('quarantine without a note is rejected before writing anything', async () => {
    const { sql, calls } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
    ]);
    const { notifications, createInTx } = makeNotificationsMock();
    const { audit, logInPgTx } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'quarantine', MEO_ADMIN, undefined, '   '),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toHaveLength(1); // only the office lookup, no UPDATE
    expect(createInTx).not.toHaveBeenCalled();
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('rejects a note over MODERATION_NOTE_MAX_LENGTH before touching the database', async () => {
    const { sql, calls } = makeFakeSql([]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(
        1,
        'quarantine',
        MEO_ADMIN,
        undefined,
        'x'.repeat(1001),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toHaveLength(0);
  });

  it('quarantine with a note flags the ticket and notifies the citizen', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
      [{ ticket_id: 5, citizen_id: 9, title: 'Pothole on Main St' }], // UPDATE reports
      [{}], // UPDATE tickets SET flagged = true
    ]);
    const { notifications, createInTx } = makeNotificationsMock();
    const { audit, logInPgTx } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    const result = await service.moderateReport(
      1,
      'quarantine',
      MEO_ADMIN,
      undefined,
      'Photo GPS is 4km from the pin, likely reused stock image.',
    );

    expect(result.status).toBe('quarantined');
    expect(createInTx).toHaveBeenCalledTimes(1);
    const [, input] = createInTx.mock.calls[0];
    expect(input.recipientType).toBe('citizen');
    expect(input.recipientId).toBe(9);
    expect(input.type).toBe('report_quarantined');

    expect(logInPgTx).toHaveBeenCalledTimes(1);
    const [, auditInput] = logInPgTx.mock.calls[0];
    expect(auditInput.actionType).toBe('report_moderated');
    expect(auditInput.metadata).toEqual({
      action: 'quarantine',
      note: 'Photo GPS is 4km from the pin, likely reused stock image.',
    });
  });

  it('duplicate requires a canonicalReportId', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'duplicate', MEO_ADMIN),
    ).rejects.toThrow(BadRequestException);
  });

  it('duplicate rejects a canonicalReportId that does not exist', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
      [], // SELECT id FROM reports WHERE id = canonical -> none
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'duplicate', MEO_ADMIN, 999),
    ).rejects.toThrow('Canonical report not found');
  });

  it('duplicate with a valid canonicalReportId stores it as the note and notifies the citizen', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
      [{ id: 42 }], // canonical exists
      [{ ticket_id: 5, citizen_id: 9, title: 'Pothole on Main St' }], // UPDATE reports
    ]);
    const { notifications, createInTx } = makeNotificationsMock();
    const { audit, logInPgTx } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    const result = await service.moderateReport(1, 'duplicate', MEO_ADMIN, 42);

    expect(result.status).toBe('duplicate');
    const [, input] = createInTx.mock.calls[0];
    expect(input.type).toBe('report_flagged_duplicate');
    expect(input.recipientId).toBe(9);

    const [, auditInput] = logInPgTx.mock.calls[0];
    expect(auditInput.actionType).toBe('report_moderated');
    expect(auditInput.metadata).toEqual({ action: 'duplicate', note: '42' });
  });

  it('rejects an already-moderated report without double-writing', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MEO' }], // report -> ticket office lookup
      [], // UPDATE reports matches zero rows (already moderated)
      [{ moderation_status: 'quarantined' }], // fallback SELECT
    ]);
    const { notifications, createInTx } = makeNotificationsMock();
    const { audit, logInPgTx } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'dismiss', MEO_ADMIN),
    ).rejects.toThrow('Report was already quarantined');
    expect(createInTx).not.toHaveBeenCalled();
    expect(logInPgTx).not.toHaveBeenCalled();
  });

  it('reports NotFoundException for a report that does not exist at all', async () => {
    const { sql } = makeFakeSql([
      [], // report -> ticket office lookup finds nothing
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'dismiss', MEO_ADMIN),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects moderation of another office's report for a non-system-admin", async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MDRRMO' }], // report -> ticket office lookup
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    await expect(
      service.moderateReport(1, 'dismiss', MEO_ADMIN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an admin to moderate a report in their own (different) office', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MDRRMO' }], // report -> ticket office lookup
      [{ ticket_id: 5, citizen_id: 9, title: 'Pothole on Main St' }], // UPDATE reports
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    const result = await service.moderateReport(1, 'dismiss', MDRRMO_ADMIN);
    expect(result.status).toBe('dismissed');
  });

  it('allows a system admin to moderate a report from any office', async () => {
    const { sql } = makeFakeSql([
      [{ assigned_office: 'MDRRMO' }], // report -> ticket office lookup
      [{ ticket_id: 5, citizen_id: 9, title: 'Pothole on Main St' }], // UPDATE reports
    ]);
    const { notifications } = makeNotificationsMock();
    const { audit } = makeAuditMock();
    const service = new ModerationService(sql, notifications, audit);

    const result = await service.moderateReport(1, 'dismiss', SYSTEM_ADMIN);
    expect(result.status).toBe('dismissed');
  });
});
