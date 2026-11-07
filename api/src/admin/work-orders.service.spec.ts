// The fake database's methods are jest mocks, asserted unbound throughout
// (expect(db.select).not.toHaveBeenCalled() and the like).
/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { SQL, is, sql as dsql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { WorkOrdersService } from './work-orders.service';
import { ASSESSMENT_REQUIRED_MESSAGE } from './work-order.rules';
import {
  operationalAssessments,
  tickets,
  workOrders,
  workOrderStatusHistory,
} from '../db/schema';
import type { AdminAuditService } from './admin-audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AdminSession } from '../auth/session.service';

const MEO_OFFICER: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'MEO Officer',
  office: 'MEO',
  accountType: 'PERSONNEL',
  isFocal: false,
};
const MDRRMO_SUPERVISOR: AdminSession = {
  adminId: 2,
  email: 'mdrrmo@example.com',
  adminName: 'MDRRMO Supervisor',
  office: 'MDRRMO',
  accountType: 'PERSONNEL',
  isFocal: false,
};
const SYSTEM_ADMIN: AdminSession = {
  adminId: 3,
  email: 'sysadmin@example.com',
  adminName: 'System Admin',
  office: null,
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
};
// Account fields of an assignee row (assertValidAssignee's lookup).
const PERSONNEL = { accountType: 'PERSONNEL', isFocal: false } as const;

const dialect = new PgDialect();
// A Drizzle SQL fragment as the SQL text and parameters it sends.
function render(value: unknown): { sql: string; params: unknown[] } {
  if (!is(value, SQL)) throw new Error('not a SQL fragment');
  const { sql, params } = dialect.sqlToQuery(value);
  return { sql, params };
}

// The Phase 4c rule: timestamps reach the database as ISO strings cast to
// timestamptz, never as JS Date objects. Every write the fake sees is
// checked, including the parameters inside SQL fragments.
function assertNoDate(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    const params = is(value, SQL) ? render(value).params : [value];
    if (params.some((p) => p instanceof Date)) {
      throw new Error(`JS Date passed to the database for ${key}`);
    }
  }
}

// What the fake saw, for assertions: each select's table, WHERE text and
// lock; each insert/update payload; each UPDATE's WHERE text. Recorded on
// the database made most recently (one per test).
interface Recorder {
  reads: {
    table: unknown;
    where?: string;
    params?: unknown[];
    lock?: string;
  }[];
  writes: Record<string, unknown>[];
  updateWheres: string[];
}
let recorder: Recorder = { reads: [], writes: [], updateWheres: [] };

// Same fake drizzle chain as admins.service.spec.ts — chains
// from/where/orderBy/values/set the way production code calls them, and
// resolves via .then like a real query-builder promise.
function chain(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  let mode: 'select' | 'update' | 'other' = 'other';
  let read: Recorder['reads'][number] | undefined;
  obj.from = (table: unknown) => {
    mode = 'select';
    read = { table };
    recorder.reads.push(read);
    return obj;
  };
  obj.where = (condition: unknown) => {
    if (condition && is(condition, SQL)) {
      const { sql, params } = render(condition);
      if (mode === 'select' && read)
        Object.assign(read, { where: sql, params });
      if (mode === 'update') recorder.updateWheres.push(sql);
    }
    return obj;
  };
  obj.for = (strength: string) => {
    if (read) read.lock = strength;
    return obj;
  };
  obj.orderBy = self;
  obj.limit = self;
  obj.offset = self;
  obj.values = (payload: Record<string, unknown>) => {
    assertNoDate(payload);
    recorder.writes.push(payload);
    return obj;
  };
  obj.set = (payload: Record<string, unknown>) => {
    assertNoDate(payload);
    mode = 'update';
    recorder.writes.push(payload);
    return obj;
  };
  obj.innerJoin = self;
  obj.leftJoin = self;
  obj.returning = (columns?: Record<string, unknown>) => {
    if (!columns) return Promise.resolve(rows);
    const keys = Object.keys(columns);
    return Promise.resolve(
      rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]]))),
    );
  };
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return obj;
}

// An update whose statement fails in the database (a constraint violation).
function failingChain(error: Error) {
  const link = chain([]);
  link.returning = () => Promise.reject(error);
  return link;
}

function makeDb() {
  recorder = { reads: [], writes: [], updateWheres: [] };
  const own = recorder;
  // Every row handed to a work_order_status_history insert, in call order.
  // That timeline is what makes the dashboard's Pending Work Orders
  // sparkline reconstructable, and it is only trustworthy if written in the
  // same transaction as the status write — so it needs real assertions, not
  // just a mock that tolerates it.
  const historyRows: Record<string, unknown>[] = [];
  const db: Record<string, unknown> = {
    select: jest.fn(),
    // Defaults to a chain rather than undefined so a test that only stubs
    // the work_orders write doesn't crash on the history row that create()
    // and setStatus() also append. Tests that care assert on historyRows.
    insert: jest.fn((table: unknown) => {
      const link = chain([]);
      if (table === workOrderStatusHistory) {
        (link as Record<string, unknown>).values = (
          row: Record<string, unknown>,
        ) => {
          assertNoDate(row);
          historyRows.push(row);
          return link;
        };
      }
      return link;
    }),
    update: jest.fn(),
  };
  db.transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(db));
  return Object.assign(
    db as unknown as PostgresJsDatabase & {
      select: jest.Mock;
      insert: jest.Mock;
      update: jest.Mock;
      transaction: jest.Mock;
    },
    {
      historyRows,
      get reads() {
        return own.reads;
      },
      get writes() {
        return own.writes;
      },
      get updateWheres() {
        return own.updateWheres;
      },
    },
  );
}

function makeDeps() {
  const logInTx = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn().mockResolvedValue(undefined);
  return {
    audit: { logInTx } as unknown as AdminAuditService,
    notifications: { create } as unknown as NotificationsService,
    logInTx,
    notifyCreate: create,
  };
}

function workOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    ticket_id: 5,
    title: 'Clear drainage',
    notes: null,
    assigned_office: 'MEO',
    assigned_admin_id: null,
    status: 'pending',
    due_date: null,
    created_by_admin_id: 1,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    completed_at: null,
    cancellation_reason: null,
    cancelled_by_admin_id: null,
    cancelled_by_name: null,
    cancelled_at: null,
    replacement_work_order_id: null,
    ...overrides,
  };
}

// A Work Order cancelled before step 5b: status cancelled, nothing else.
const LEGACY_CANCELLED = workOrderRow({ status: 'cancelled' });

describe('WorkOrdersService.parseQuery office scoping', () => {
  const db = makeDb();
  const { audit, notifications } = makeDeps();
  const service = new WorkOrdersService(db, notifications, audit);

  it('clamps an officer to their own office regardless of the query param', () => {
    expect(service.parseQuery({}, MEO_OFFICER).office).toBe('MEO');
    expect(service.parseQuery({ office: 'MDRRMO' }, MEO_OFFICER).office).toBe(
      'MEO',
    );
    expect(service.parseQuery({ office: 'all' }, MEO_OFFICER).office).toBe(
      'MEO',
    );
  });

  it('clamps a supervisor to their own office regardless of the query param', () => {
    expect(
      service.parseQuery({ office: 'MEO' }, MDRRMO_SUPERVISOR).office,
    ).toBe('MDRRMO');
  });

  // Batch 1 (five-role RBAC): system_admin no longer has routine
  // operational access — resolveOfficeScope now rejects it outright rather
  // than widening to city-wide or honoring a requested office.
  it('rejects a system admin outright rather than defaulting to city-wide', () => {
    expect(() => service.parseQuery({}, SYSTEM_ADMIN)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a system admin even when a specific office is requested', () => {
    expect(() =>
      service.parseQuery({ office: 'MDRRMO' }, SYSTEM_ADMIN),
    ).toThrow(ForbiddenException);
  });
});

describe('WorkOrdersService.parseQuery "My Assignments" (assignedAdminId=me)', () => {
  const db = makeDb();
  const { audit, notifications } = makeDeps();
  const service = new WorkOrdersService(db, notifications, audit);

  it('resolves "me" to the caller\'s own adminId, not a client-supplied id', () => {
    expect(
      service.parseQuery({ assignedAdminId: 'me' }, MEO_OFFICER)
        .assignedAdminId,
    ).toBe(1);
    expect(
      service.parseQuery({ assignedAdminId: 'me' }, MDRRMO_SUPERVISOR)
        .assignedAdminId,
    ).toBe(2);
  });

  // Batch 1 (five-role RBAC): system_admin no longer has routine
  // operational access — parseQuery rejects it before assignedAdminId is
  // even resolved, since resolveOfficeScope runs first.
  it('rejects a system admin outright — no "My Assignments" for a non-operational role', () => {
    expect(() =>
      service.parseQuery({ assignedAdminId: 'me' }, SYSTEM_ADMIN),
    ).toThrow(ForbiddenException);
  });

  it('still accepts a raw numeric assignedAdminId (unrelated existing behavior, unchanged)', () => {
    expect(
      service.parseQuery({ assignedAdminId: '7' }, MEO_OFFICER).assignedAdminId,
    ).toBe(7);
  });

  it('leaves assignedAdminId undefined when absent', () => {
    expect(service.parseQuery({}, MEO_OFFICER).assignedAdminId).toBeUndefined();
  });

  it('combines with office/status/overdue rather than replacing them', () => {
    const filters = service.parseQuery(
      { assignedAdminId: 'me', status: 'in_progress', overdue: 'true' },
      MEO_OFFICER,
    );
    expect(filters).toMatchObject({
      office: 'MEO',
      assignedAdminId: 1,
      status: 'in_progress',
      overdue: true,
    });
  });
});

// The Work Order's ticket as WorkOrdersService.lockTicket reads it: the
// CURRENT responsible office, status and merged state (manuscript revision
// Phase 5, step 5b).
function ticketChain(overrides: Partial<Record<string, unknown>> = {}) {
  return chain({
    id: 5,
    status: 'Under Review',
    assigned_office: 'MEO',
    merged_into_ticket_id: null,
    ...overrides,
  });
}
// An Operational Assessment with assessed conditions exists.
const assessed = () => chain({ id: 1 });

const CREATE_INPUT = {
  ticketId: 5,
  title: 'Fix it',
  notes: null,
  assignedAdminId: null,
  dueDate: null,
};
const NO_CHANGE = {
  title: undefined,
  notes: undefined,
  assignedAdminId: undefined,
  dueDate: undefined,
};
const FOCAL: AdminSession = {
  adminId: 4,
  email: 'focal@example.com',
  adminName: 'Focal Personnel',
  office: 'MDRRMO',
  accountType: 'PERSONNEL',
  isFocal: true,
};

describe('fake database used by these tests', () => {
  it('rejects a JS Date passed to a write, as the Phase 4c rule requires', () => {
    const link = chain([]) as { set: (v: unknown) => unknown };
    expect(() => link.set({ updatedAt: new Date() })).toThrow(/JS Date/);
    expect(() =>
      link.set({ updatedAt: dsql`${new Date()}::timestamptz` }),
    ).toThrow(/JS Date/);
    expect(() =>
      link.set({ updatedAt: dsql`${'2026-01-01T00:00:00.000Z'}::timestamptz` }),
    ).not.toThrow();
  });
});

describe('WorkOrdersService.create', () => {
  it('rejects a missing title before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ...CREATE_INPUT, title: '' }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a title over WORK_ORDER_TITLE_MAX_LENGTH before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ...CREATE_INPUT, title: 'x'.repeat(201) }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects an invalid ticketId before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create(
        { ...CREATE_INPUT, ticketId: 'not-a-number' },
        MEO_OFFICER,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects an invalid due date before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ...CREATE_INPUT, dueDate: 'not-a-date' }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('404s when the ticket does not exist', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.create(CREATE_INPUT, MEO_OFFICER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each([
    ['a MEO officer on an MDRRMO ticket (cross-office)', MEO_OFFICER],
    ['a System Administrator (no city-wide bypass)', SYSTEM_ADMIN],
    ['Focal Personnel (intake only, even on an MDRRMO ticket)', FOCAL],
  ])('refuses %s with 403', async (_label, actor) => {
    const db = makeDb();
    db.select.mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.create(CREATE_INPUT, actor)).rejects.toThrow(
      ForbiddenException,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses a merged-away ticket with 409 (read-only history)', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(ticketChain({ merged_into_ticket_id: 9 }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.create(CREATE_INPUT, MEO_OFFICER)).rejects.toThrow(
      new ConflictException(
        'Ticket #5 was merged into Ticket #9 and is read-only.',
      ),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses a Rejected ticket with 409', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(ticketChain({ status: 'Rejected' }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.create(CREATE_INPUT, MEO_OFFICER)).rejects.toThrow(
      new ConflictException(
        'Ticket #5 is Rejected; its Work Orders can no longer be created or changed.',
      ),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses with 409 "Add an Operational Assessment first." when the ticket has no assessment with assessed conditions', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(ticketChain()).mockReturnValueOnce(chain([]));
    const { audit, notifications, logInTx, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.create(CREATE_INPUT, MEO_OFFICER)).rejects.toThrow(
      new ConflictException(ASSESSMENT_REQUIRED_MESSAGE),
    );
    expect(ASSESSMENT_REQUIRED_MESSAGE).toBe(
      'Add an Operational Assessment first.',
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(logInTx).not.toHaveBeenCalled();
    expect(notifyCreate).not.toHaveBeenCalled();
  });

  it('looks the assessment up by ticket and non-blank assessed conditions, after locking the ticket row', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed());
    db.insert.mockReturnValueOnce(chain(workOrderRow()));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.create(CREATE_INPUT, MEO_OFFICER);
    expect(db.reads[0]).toMatchObject({
      table: tickets,
      lock: 'update',
    });
    expect(db.reads[1].table).toBe(operationalAssessments);
    expect(db.reads[1].where).toMatch(
      /btrim\("operational_assessments"\."assessed_conditions"\) <> ''/,
    );
    expect(db.reads[1].params).toEqual([5]);
  });

  it('runs the ticket check, assessment check and insert in one transaction', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed());
    db.insert.mockReturnValueOnce(chain(workOrderRow()));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.create(CREATE_INPUT, MEO_OFFICER);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  // Same coverage the old (now-removed) system_admin-actor test carried for
  // the successful-creation path — audit log, origin history row, and the
  // office-wide notification — just created by an in-office supervisor
  // instead, since system_admin can no longer reach this method at all.
  it('creates a work order, logs the audit event, seeds an origin history row, and notifies the office', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }))
      .mockReturnValueOnce(assessed());
    db.insert.mockReturnValueOnce(
      chain(workOrderRow({ assigned_office: 'MDRRMO' })),
    );
    const { audit, notifications, logInTx, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.create(
      { ...CREATE_INPUT, notes: 'progress note' },
      MDRRMO_SUPERVISOR,
    );
    expect(result.assigned_office).toBe('MDRRMO');
    expect(db.writes[0]).toMatchObject({ assignedOffice: 'MDRRMO' });
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actionType: 'work_order_created',
        targetType: 'work_order',
        metadata: {
          ticketId: 5,
          assignedOffice: 'MDRRMO',
          hasDueDate: false,
          assignedAdminId: null,
        },
      }),
    );
    // Origin row: without it a work order never touched again would have no
    // history at all, and the as-of trend query would have nothing to
    // resolve it to on any date.
    expect(db.historyRows).toEqual([
      expect.objectContaining({ workOrderId: result.id, status: 'pending' }),
    ]);
    // Office-wide notification (no assignedAdminId) rather than a targeted one.
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientOffice: 'MDRRMO',
        type: 'work_order_created',
      }),
    );
  });

  it('writes the due date as an ISO string cast to timestamptz, never a JS Date', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed());
    db.insert.mockReturnValueOnce(chain(workOrderRow()));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.create(
      { ...CREATE_INPUT, dueDate: '2026-03-01' },
      MEO_OFFICER,
    );
    expect(render(db.writes[0].dueDate)).toEqual({
      sql: '$1::timestamptz',
      params: ['2026-03-01T00:00:00.000Z'],
    });
  });

  it("accepts a valid assignedAdminId (active, belongs to the ticket's office)", async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MEO', isActive: true }),
      ); // assignee lookup
    db.insert.mockReturnValueOnce(
      chain(workOrderRow({ assigned_admin_id: 7 })),
    );
    const { audit, notifications, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.create(
      { ...CREATE_INPUT, assignedAdminId: 7 },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBe(7);
    // Targeted notification, not office-wide, once a specific admin is assigned.
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 7, type: 'work_order_assigned' }),
    );
  });

  it('checks the assessment before the assignee', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(ticketChain()).mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ...CREATE_INPUT, assignedAdminId: 7 }, MEO_OFFICER),
    ).rejects.toThrow(ConflictException);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('rejects assignedAdminId belonging to a different office than the ticket', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MDRRMO', isActive: true }),
      ); // assignee is MDRRMO
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ...CREATE_INPUT, assignedAdminId: 7 }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Phase 2, step 2e: Focal Personnel carries office MDRRMO but is
  // intake-only — never an assignee, even on an MDRRMO ticket. The System
  // Administrator (no office) never is either.
  it.each([
    [
      'a Focal account on MDRRMO',
      { accountType: 'PERSONNEL', isFocal: true, office: 'MDRRMO' },
    ],
    [
      'a System Administrator',
      { accountType: 'SYSTEM_ADMIN', isFocal: false, office: null },
    ],
  ])(
    'rejects %s as the assignee of an MDRRMO work order',
    async (_label, assignee) => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }))
        .mockReturnValueOnce(assessed())
        .mockReturnValueOnce(chain({ ...assignee, isActive: true })); // assignee lookup
      const { audit, notifications, notifyCreate } = makeDeps();
      const service = new WorkOrdersService(db, notifications, audit);

      await expect(
        service.create(
          { ...CREATE_INPUT, assignedAdminId: 8 },
          MDRRMO_SUPERVISOR,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'assignedAdminId must be an active Personnel account belonging to this office.',
        ),
      );
      expect(db.insert.mock.calls).toHaveLength(0);
      expect(notifyCreate).not.toHaveBeenCalled();
    },
  );

  it('accepts MDRRMO Personnel as the assignee of an MDRRMO work order', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }))
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MDRRMO', isActive: true }),
      );
    db.insert.mockReturnValueOnce(
      chain(workOrderRow({ assigned_office: 'MDRRMO', assigned_admin_id: 9 })),
    );
    const { audit, notifications, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.create(
      { ...CREATE_INPUT, title: 'Clear the drain', assignedAdminId: 9 },
      MDRRMO_SUPERVISOR,
    );
    expect(result.assigned_admin_id).toBe(9);
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 9, type: 'work_order_assigned' }),
    );
  });

  it('rejects an inactive assignedAdminId even when the office matches', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MEO', isActive: false }),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ...CREATE_INPUT, assignedAdminId: 7 }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects notes over WORK_ORDER_NOTES_MAX_LENGTH', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ...CREATE_INPUT, notes: 'x'.repeat(2001) }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent assignedAdminId', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(chain([])); // no admin row found
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ...CREATE_INPUT, assignedAdminId: 999 }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('WorkOrdersService.bulkCreate', () => {
  // bulkCreate loops create(), so every rule above holds for it too; each
  // ticket that fails is reported with its reason and the rest succeed.
  it('reports "Add an Operational Assessment first." for a ticket without an assessment and creates the others', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(ticketChain({ id: 5 }))
      .mockReturnValueOnce(assessed())
      .mockReturnValueOnce(ticketChain({ id: 6 }))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(ticketChain({ id: 7, status: 'Rejected' }));
    db.insert.mockReturnValueOnce(chain(workOrderRow({ ticket_id: 5 })));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.bulkCreate(
      [5, 6, 7],
      { title: 'Fix it', notes: null, assignedAdminId: null, dueDate: null },
      MEO_OFFICER,
    );
    expect(result).toEqual({
      ok: [5],
      skipped: [
        { id: 6, reason: 'Add an Operational Assessment first.' },
        {
          id: 7,
          reason:
            'Ticket #7 is Rejected; its Work Orders can no longer be created or changed.',
        },
      ],
    });
  });

  it('has no insert path of its own: it calls create() for each ticket', () => {
    const source = readFileSync(
      join(__dirname, 'work-orders.service.ts'),
      'utf8',
    );
    const bulk = source.slice(
      source.indexOf('async bulkCreate('),
      source.indexOf('async create('),
    );
    expect(bulk).toMatch(/this\.create\(/);
    expect(bulk).not.toMatch(/insert\(/);
    // create() is the only place that inserts a Work Order.
    expect(source.match(/\.insert\(workOrders\)/g)).toHaveLength(1);
  });
});

describe('WorkOrdersService single-resource reads', () => {
  it('get() blocks an MDRRMO supervisor from reading a MEO work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(
      chain(workOrderRow({ assigned_office: 'MEO' })),
    );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.get(10, MDRRMO_SUPERVISOR)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('get() throws NotFoundException for a missing work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.get(999, SYSTEM_ADMIN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('get() still reads a Work Order cancelled before step 5b, with no reason, who or when', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(LEGACY_CANCELLED));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const row = await service.get(10, MEO_OFFICER);
    expect(row).toMatchObject({
      status: 'cancelled',
      cancellation_reason: null,
      cancelled_by_admin_id: null,
      cancelled_at: null,
      replacement_work_order_id: null,
    });
  });

  it('returns the cancellation fields and the canceller name to staff', () => {
    const source = readFileSync(
      join(__dirname, 'work-orders.service.ts'),
      'utf8',
    );
    const safe = source.slice(source.indexOf('const SAFE_COLUMNS'));
    for (const field of [
      'cancellation_reason',
      'cancelled_by_admin_id',
      'cancelled_by_name',
      'cancelled_at',
      'replacement_work_order_id',
    ]) {
      expect(safe).toContain(`${field}:`);
    }
  });
});

describe('WorkOrdersService.setStatus', () => {
  it('rejects an unknown status value before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(10, 'not-a-status', MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('404s for a missing work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(999, 'in_progress', MEO_OFFICER),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['an MDRRMO admin on a MEO ticket', MDRRMO_SUPERVISOR],
    ['a System Administrator', SYSTEM_ADMIN],
    ['Focal Personnel', FOCAL],
  ])('refuses %s with 403', async (_label, actor) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.setStatus(10, 'in_progress', actor)).rejects.toThrow(
      ForbiddenException,
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("follows the ticket's CURRENT office, not the Work Order's own office", async () => {
    // A legacy active Work Order created by MEO on a ticket since moved to
    // MDRRMO: MDRRMO acts on it, MEO no longer can.
    const meoDb = makeDb();
    meoDb.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }));
    const meoDeps = makeDeps();
    await expect(
      new WorkOrdersService(
        meoDb,
        meoDeps.notifications,
        meoDeps.audit,
      ).setStatus(10, 'in_progress', MEO_OFFICER),
    ).rejects.toThrow(ForbiddenException);

    const mdrrmoDb = makeDb();
    mdrrmoDb.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }));
    mdrrmoDb.update.mockReturnValueOnce(
      chain(workOrderRow({ status: 'in_progress' })),
    );
    const mdrrmoDeps = makeDeps();
    await expect(
      new WorkOrdersService(
        mdrrmoDb,
        mdrrmoDeps.notifications,
        mdrrmoDeps.audit,
      ).setStatus(10, 'in_progress', MDRRMO_SUPERVISOR),
    ).resolves.toMatchObject({ status: 'in_progress' });
  });

  it('refuses a merged-away ticket with 409', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain({ merged_into_ticket_id: 9 }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(10, 'in_progress', MEO_OFFICER),
    ).rejects.toThrow(ConflictException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('refuses a Rejected ticket with 409', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain({ status: 'Rejected' }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(10, 'in_progress', MEO_OFFICER),
    ).rejects.toThrow(
      new ConflictException(
        'Ticket #5 is Rejected; its Work Orders can no longer be created or changed.',
      ),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'completed'],
    ['pending', 'pending'],
    ['in_progress', 'pending'],
    ['in_progress', 'in_progress'],
  ])('refuses %s -> %s with 409 naming both statuses', async (from, to) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ status: from })))
      .mockReturnValueOnce(ticketChain());
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const label = (s: string) => s.replace('_', ' ');
    await expect(service.setStatus(10, to, MEO_OFFICER)).rejects.toThrow(
      new ConflictException(
        `Work Order #10 cannot move from ${label(from)} to ${label(to)}.`,
      ),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    ['completed', 'in_progress'],
    ['completed', 'pending'],
    ['completed', 'completed'],
    ['cancelled', 'pending'],
    ['cancelled', 'in_progress'],
    ['cancelled', 'completed'],
  ])('a %s Work Order is final: -> %s is 409', async (from, to) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ status: from })))
      .mockReturnValueOnce(ticketChain());
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.setStatus(10, to, MEO_OFFICER)).rejects.toThrow(
      new ConflictException(
        `Work Order #10 is ${from} and final; it can no longer be changed.`,
      ),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('pending -> in_progress appends one history row inside the same transaction as the status write', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ status: 'in_progress' })),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await service.setStatus(10, 'in_progress', MEO_OFFICER);

    expect(db.historyRows).toHaveLength(1);
    expect(db.historyRows[0]).toMatchObject({ status: 'in_progress' });
    // One transaction, and the history insert happened within it — the whole
    // point, since a separate write could fail independently and desync the
    // timeline from work_orders.status.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.writes[0]).toMatchObject({
      status: 'in_progress',
      completedAt: null,
    });
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actionType: 'work_order_status_changed',
        metadata: { from: 'pending', to: 'in_progress' },
      }),
    );
  });

  it('in_progress -> completed sets completed_at (an ISO string, ::timestamptz) and logs work_order_completed', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ status: 'in_progress' })))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(
        workOrderRow({
          status: 'completed',
          completed_at: new Date('2026-01-02T00:00:00Z'),
        }),
      ),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.setStatus(10, 'completed', MEO_OFFICER);
    expect(result.status).toBe('completed');
    const completedAt = render(db.writes[0].completedAt);
    expect(completedAt.sql).toBe('$1::timestamptz');
    expect(completedAt.params[0]).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
    );
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actionType: 'work_order_completed',
        metadata: { from: 'in_progress', to: 'completed' },
      }),
    );
    // The dashboard trend replays this table, so a transition that updates
    // work_orders without appending here would leave the sparkline showing
    // the work order as still pending forever.
    expect(db.historyRows).toEqual([
      expect.objectContaining({
        workOrderId: 10,
        status: 'completed',
        adminId: MEO_OFFICER.adminId,
        adminName: MEO_OFFICER.adminName,
      }),
    ]);
  });

  it('completing never touches the ticket: the only table updated is work_orders', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ status: 'in_progress' })))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(chain(workOrderRow({ status: 'completed' })));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.setStatus(10, 'completed', MEO_OFFICER);
    expect(db.update.mock.calls).toEqual([[workOrders]]);
  });

  it('the write itself also requires the ticket to be not merged away and not Rejected', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ status: 'in_progress' })),
    );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.setStatus(10, 'in_progress', MEO_OFFICER);
    expect(db.updateWheres[0]).toMatch(/t\.merged_into_ticket_id IS NULL/);
    expect(db.updateWheres[0]).toMatch(/t\.status <> 'Rejected'/);
  });

  it('409s when the guarded write matches no row (state changed underneath)', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(chain([]));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(10, 'in_progress', MEO_OFFICER),
    ).rejects.toThrow(ConflictException);
    expect(logInTx).not.toHaveBeenCalled();
  });

  it("status 'cancelled' goes through cancel() and so needs a reason", async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.setStatus(10, 'cancelled', MEO_OFFICER),
    ).rejects.toThrow(
      new BadRequestException('A cancellation reason is required.'),
    );
    expect(db.select).not.toHaveBeenCalled();

    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(chain(workOrderRow({ status: 'cancelled' })));
    await service.setStatus(10, 'cancelled', MEO_OFFICER, {
      reason: 'Duplicate of #11',
    });
    expect(db.writes[0]).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Duplicate of #11',
    });
  });
});

describe('WorkOrdersService.cancel', () => {
  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['not text', 42],
  ])(
    'refuses a %s reason with 400 before touching the database',
    async (_l, reason) => {
      const db = makeDb();
      const { audit, notifications } = makeDeps();
      const service = new WorkOrdersService(db, notifications, audit);
      await expect(service.cancel(10, { reason }, MEO_OFFICER)).rejects.toThrow(
        new BadRequestException('A cancellation reason is required.'),
      );
      expect(db.select).not.toHaveBeenCalled();
    },
  );

  it('refuses a reason over 1000 characters with 400', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.cancel(10, { reason: 'x'.repeat(1001) }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('refuses the Work Order as its own replacement, and a non-id replacement, with 400', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.cancel(
        10,
        { reason: 'x', replacementWorkOrderId: 10 },
        MEO_OFFICER,
      ),
    ).rejects.toThrow(
      new BadRequestException('A Work Order cannot be its own replacement.'),
    );
    await expect(
      service.cancel(
        10,
        { reason: 'x', replacementWorkOrderId: 'abc' },
        MEO_OFFICER,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each(['pending', 'in_progress'])(
    'cancels a %s Work Order in one UPDATE: status, trimmed reason, who, when (ISO), no completed_at',
    async (from) => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(workOrderRow({ status: from })))
        .mockReturnValueOnce(ticketChain());
      db.update.mockReturnValueOnce(
        chain(workOrderRow({ status: 'cancelled' })),
      );
      const { audit, notifications, logInTx } = makeDeps();
      const service = new WorkOrdersService(db, notifications, audit);
      await service.cancel(10, { reason: '  Duplicate of #11  ' }, MEO_OFFICER);

      expect(db.update).toHaveBeenCalledTimes(1);
      const write = db.writes[0];
      expect(write).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Duplicate of #11',
        cancelledByAdminId: MEO_OFFICER.adminId,
        replacementWorkOrderId: null,
        completedAt: null,
      });
      const cancelledAt = render(write.cancelledAt);
      expect(cancelledAt.sql).toBe('$1::timestamptz');
      expect(typeof cancelledAt.params[0]).toBe('string');
      expect(db.historyRows).toEqual([
        expect.objectContaining({ workOrderId: 10, status: 'cancelled' }),
      ]);
      expect(logInTx).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          actionType: 'work_order_cancelled',
          metadata: { from, to: 'cancelled', reason: 'Duplicate of #11' },
        }),
      );
      // Never the ticket's status.
      expect(db.update.mock.calls).toEqual([[workOrders]]);
    },
  );

  it.each(['completed', 'cancelled'])(
    'a %s Work Order cannot be cancelled (409)',
    async (status) => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(workOrderRow({ status })))
        .mockReturnValueOnce(ticketChain());
      const { audit, notifications } = makeDeps();
      const service = new WorkOrdersService(db, notifications, audit);
      await expect(
        service.cancel(10, { reason: 'x' }, MEO_OFFICER),
      ).rejects.toThrow(
        new ConflictException(
          `Work Order #10 is ${status} and final; it can no longer be changed.`,
        ),
      );
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it('a legacy cancelled Work Order (no reason on record) is final too', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(LEGACY_CANCELLED))
      .mockReturnValueOnce(ticketChain());
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.cancel(10, { reason: 'adding a reason later' }, MEO_OFFICER),
    ).rejects.toThrow(ConflictException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an MDRRMO admin on a MEO ticket',
      MDRRMO_SUPERVISOR,
      {},
      ForbiddenException,
    ],
    ['a System Administrator', SYSTEM_ADMIN, {}, ForbiddenException],
    ['Focal Personnel', FOCAL, {}, ForbiddenException],
    [
      'on a Rejected ticket',
      MEO_OFFICER,
      { status: 'Rejected' },
      ConflictException,
    ],
    [
      'on a merged-away ticket',
      MEO_OFFICER,
      { merged_into_ticket_id: 9 },
      ConflictException,
    ],
  ])('is refused %s', async (_label, actor, ticket, error) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain(ticket));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.cancel(10, { reason: 'x' }, actor)).rejects.toThrow(
      error,
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('stores a replacement on the same ticket and records it in the audit metadata', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(chain({ id: 11, ticket_id: 5, status: 'pending' }));
    db.update.mockReturnValueOnce(
      chain(
        workOrderRow({ status: 'cancelled', replacement_work_order_id: 11 }),
      ),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.cancel(
      10,
      { reason: 'Re-scoped', replacementWorkOrderId: '11' },
      MEO_OFFICER,
    );
    expect(result.replacement_work_order_id).toBe(11);
    expect(db.writes[0]).toMatchObject({ replacementWorkOrderId: 11 });
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        metadata: {
          from: 'pending',
          to: 'cancelled',
          reason: 'Re-scoped',
          replacementWorkOrderId: 11,
        },
      }),
    );
  });

  it.each([
    [
      'does not exist',
      [],
      BadRequestException,
      'Replacement Work Order #11 was not found.',
    ],
    [
      'belongs to another ticket',
      [{ id: 11, ticket_id: 6, status: 'pending' }],
      BadRequestException,
      'Replacement Work Order #11 belongs to another ticket; choose one of Ticket #5.',
    ],
    [
      'is completed',
      [{ id: 11, ticket_id: 5, status: 'completed' }],
      ConflictException,
      'Replacement Work Order #11 is completed; choose a pending or in-progress Work Order.',
    ],
    [
      'is cancelled',
      [{ id: 11, ticket_id: 5, status: 'cancelled' }],
      ConflictException,
      'Replacement Work Order #11 is cancelled; choose a pending or in-progress Work Order.',
    ],
  ])('refuses a replacement that %s', async (_label, rows, error, message) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(chain(rows));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const attempt = service.cancel(
      10,
      { reason: 'x', replacementWorkOrderId: 11 },
      MEO_OFFICER,
    );
    await expect(attempt).rejects.toThrow(error);
    await expect(attempt).rejects.toThrow(message);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('maps a same-ticket FK violation from the database to a clean 400, and a CHECK violation to 409', async () => {
    const fk = Object.assign(new Error('Failed query'), {
      cause: {
        code: '23503',
        constraint_name: 'work_orders_replacement_same_ticket_fkey',
      },
    });
    const check = Object.assign(new Error('violates check constraint'), {
      code: '23514',
      constraint_name: 'work_orders_cancellation_check',
    });
    for (const [dbError, expected] of [
      [
        fk,
        new BadRequestException(
          'The replacement must be a Work Order of the same ticket.',
        ),
      ],
      [check, ConflictException],
    ] as const) {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(workOrderRow()))
        .mockReturnValueOnce(ticketChain());
      db.update.mockReturnValueOnce(failingChain(dbError));
      const { audit, notifications } = makeDeps();
      const service = new WorkOrdersService(db, notifications, audit);
      await expect(
        service.cancel(10, { reason: 'x' }, MEO_OFFICER),
      ).rejects.toThrow(expected);
    }
  });
});

describe('WorkOrdersService.update', () => {
  it('never writes note bodies into audit metadata, only changed field names', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ notes: 'sensitive progress detail' })),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.update(
      10,
      { ...NO_CHANGE, notes: 'sensitive progress detail' },
      MEO_OFFICER,
    );
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['notes'] } }),
    );
    const loggedMetadata = logInTx.mock.calls[0][1].metadata;
    expect(JSON.stringify(loggedMetadata)).not.toContain(
      'sensitive progress detail',
    );
  });

  it('changes the due date (an ISO string, ::timestamptz) and logs only the field name in audit metadata', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ due_date: new Date('2026-03-01T00:00:00Z') })),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { ...NO_CHANGE, dueDate: '2026-03-01' },
      MEO_OFFICER,
    );
    expect(result.due_date).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(render(db.writes[0].dueDate)).toEqual({
      sql: '$1::timestamptz',
      params: ['2026-03-01T00:00:00.000Z'],
    });
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['dueDate'] } }),
    );
  });

  it('clears the due date back to null when given an empty dueDate', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(
        chain(workOrderRow({ due_date: new Date('2026-03-01T00:00:00Z') })),
      )
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(chain(workOrderRow({ due_date: null })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { ...NO_CHANGE, dueDate: null },
      MEO_OFFICER,
    );
    expect(result.due_date).toBeNull();
    expect(db.writes[0].dueDate).toBeNull();
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['dueDate'] } }),
    );
  });

  it('rejects an invalid due date', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain());
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { ...NO_CHANGE, dueDate: 'not-a-date' }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    ['notes', { notes: 'late note' }],
    ['the title', { title: 'Renamed' }],
    ['the assignee', { assignedAdminId: 7 }],
    ['the due date', { dueDate: '2026-03-01' }],
  ])(
    'refuses to change %s on a completed or cancelled Work Order (409)',
    async (_label, change) => {
      for (const status of ['completed', 'cancelled']) {
        const db = makeDb();
        db.select
          .mockReturnValueOnce(chain(workOrderRow({ status })))
          .mockReturnValueOnce(ticketChain());
        const { audit, notifications } = makeDeps();
        const service = new WorkOrdersService(db, notifications, audit);
        await expect(
          service.update(10, { ...NO_CHANGE, ...change }, MEO_OFFICER),
        ).rejects.toThrow(
          new ConflictException(
            `Work Order #10 is ${status} and final; it can no longer be changed.`,
          ),
        );
        expect(db.update).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    [
      'an MDRRMO admin on a MEO ticket',
      MDRRMO_SUPERVISOR,
      {},
      ForbiddenException,
    ],
    ['Focal Personnel', FOCAL, {}, ForbiddenException],
    ['a System Administrator', SYSTEM_ADMIN, {}, ForbiddenException],
    [
      'on a Rejected ticket',
      MEO_OFFICER,
      { status: 'Rejected' },
      ConflictException,
    ],
    [
      'on a merged-away ticket',
      MEO_OFFICER,
      { merged_into_ticket_id: 9 },
      ConflictException,
    ],
  ])('is refused %s', async (_label, actor, ticket, error) => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow()))
      .mockReturnValueOnce(ticketChain(ticket));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.update(10, { ...NO_CHANGE, notes: 'x' }, actor),
    ).rejects.toThrow(error);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('accepts a valid assignedAdminId and logs its from/to in audit metadata', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(
        chain(
          workOrderRow({ assigned_office: 'MEO', assigned_admin_id: null }),
        ),
      )
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MEO', isActive: true }),
      );
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ assigned_admin_id: 7 })),
    );
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { ...NO_CHANGE, assignedAdminId: 7 },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBe(7);
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        metadata: {
          changedFields: ['assignedAdminId'],
          assignedAdminId: { from: null, to: 7 },
        },
      }),
    );
  });

  it('rejects reassigning to an admin from a different office than the work order', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MDRRMO', isActive: true }),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { ...NO_CHANGE, assignedAdminId: 7 }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects reassigning an MDRRMO work order to a Focal account', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MDRRMO' })))
      .mockReturnValueOnce(ticketChain({ assigned_office: 'MDRRMO' }))
      .mockReturnValueOnce(
        chain({
          accountType: 'PERSONNEL',
          isFocal: true,
          office: 'MDRRMO',
          isActive: true,
        }),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(
        10,
        { ...NO_CHANGE, assignedAdminId: 8 },
        MDRRMO_SUPERVISOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(db.update.mock.calls).toHaveLength(0);
  });

  it('rejects reassigning to an inactive admin', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(ticketChain())
      .mockReturnValueOnce(
        chain({ ...PERSONNEL, office: 'MEO', isActive: false }),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { ...NO_CHANGE, assignedAdminId: 7 }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows clearing assignedAdminId back to null (unassigned / office-wide) without validation', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(
        chain(workOrderRow({ assigned_office: 'MEO', assigned_admin_id: 7 })),
      )
      .mockReturnValueOnce(ticketChain());
    db.update.mockReturnValueOnce(
      chain(workOrderRow({ assigned_admin_id: null })),
    );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { ...NO_CHANGE, assignedAdminId: null },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBeNull();
    // Two selects (the Work Order and its ticket) — no assignee lookup for a
    // null clear.
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});

describe('Work Order and assessment data never reach citizens', () => {
  // The citizen-facing modules (citizen reports, accounts, public map) have
  // no read of Work Orders, their cancellation fields or assessments.
  it('no citizen-side source file reads work_orders or operational_assessments', () => {
    const roots = ['reports', 'citizens'].map((d) => join(__dirname, '..', d));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts')
        ) {
          const source = readFileSync(path, 'utf8');
          if (
            /\bwork_orders\b|workOrders\b|operational_assessments|operationalAssessments|cancellation_reason|operational_constraint_notes/.test(
              source,
            )
          ) {
            offenders.push(path);
          }
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});

describe('WorkOrdersService.getOfficePerformanceCounts', () => {
  // Feeds the admin dashboard's Office Performance Summary
  // (dashboard.controller.ts) — verifies the four counts are wired to the
  // right fields (a swapped-order regression would silently mislabel
  // pending as in-progress, etc.) without depending on Drizzle's internal
  // SQL-builder representation, which the fake `chain()` query builder
  // doesn't model. Overdue/completed-this-week predicate correctness and
  // office-scoping RBAC are covered end-to-end in
  // e2e/admin-work-orders.spec.ts against a real database.
  it('maps four independent count queries to pending/inProgress/overdue/completedThisWeek in order', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain([{ count: 3 }]))
      .mockReturnValueOnce(chain([{ count: 5 }]))
      .mockReturnValueOnce(chain([{ count: 1 }]))
      .mockReturnValueOnce(chain([{ count: 7 }]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.getOfficePerformanceCounts('MEO');

    expect(result).toEqual({
      pendingWorkOrders: 3,
      inProgressWorkOrders: 5,
      overdueWorkOrders: 1,
      completedWorkOrdersThisWeek: 7,
    });
    expect(db.select).toHaveBeenCalledTimes(4);
  });

  it('defaults every count to 0 when a query returns no row', async () => {
    const db = makeDb();
    db.select.mockReturnValue(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.getOfficePerformanceCounts(undefined);

    expect(result).toEqual({
      pendingWorkOrders: 0,
      inProgressWorkOrders: 0,
      overdueWorkOrders: 0,
      completedWorkOrdersThisWeek: 0,
    });
  });
});

describe('WorkOrdersService.getNeedsAttention', () => {
  // Verifies the two lists map to the right buckets — office scoping itself
  // (the `office` filter is applied identically to every other list/summary
  // query in this service) is covered end-to-end in
  // e2e/admin-work-orders.spec.ts. The Hazard Urgency list (tickets with open
  // work) was removed in manuscript revision Phase 1, step 6a.
  it('maps the two independent queries to overdue/dueToday and returns no Hazard Urgency list', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(
        chain([workOrderRow({ id: 1, due_date: new Date('2020-01-01') })]),
      )
      .mockReturnValueOnce(
        chain([workOrderRow({ id: 2, due_date: new Date() })]),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.getNeedsAttention('MEO');

    expect(result.overdueWorkOrders.map((w) => w.id)).toEqual([1]);
    expect(result.dueTodayWorkOrders.map((w) => w.id)).toEqual([2]);
    expect(result).not.toHaveProperty('highUrgencyTicketsWithOpenWork');
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('returns empty lists when nothing needs attention', async () => {
    const db = makeDb();
    db.select.mockReturnValue(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.getNeedsAttention(undefined);

    expect(result).toEqual({
      overdueWorkOrders: [],
      dueTodayWorkOrders: [],
    });
  });
});

describe('WorkOrdersService.getWorkOrdersForExport', () => {
  it('returns the joined export shape and never a notes field', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(
      chain([
        {
          id: 7,
          ticket_id: 42,
          title: 'Clear drainage',
          assigned_office: 'MEO',
          assigned_admin_name: 'Jane Doe',
          assigned_admin_email: 'jane@porac.gov.ph',
          status: 'in_progress',
          due_date: null,
          completed_at: null,
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-01'),
        },
      ]),
    );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const rows = await service.getWorkOrdersForExport({ office: 'MEO' });

    expect(rows).toHaveLength(1);
    expect(rows[0].assigned_admin_email).toBe('jane@porac.gov.ph');
    expect(rows[0]).not.toHaveProperty('notes');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when nothing matches', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.getWorkOrdersForExport({ office: 'MDRRMO' }),
    ).resolves.toEqual([]);
  });

  it('defaults to no filters when called with no arguments', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(service.getWorkOrdersForExport()).resolves.toEqual([]);
  });
});
