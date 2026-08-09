import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { WorkOrdersService } from './work-orders.service';
import type { AdminAuditService } from './admin-audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AdminSession } from '../auth/session.service';

const MEO_OFFICER: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'MEO Officer',
  office: 'MEO',
  role: 'officer',
};
const MDRRMO_SUPERVISOR: AdminSession = {
  adminId: 2,
  email: 'mdrrmo@example.com',
  adminName: 'MDRRMO Supervisor',
  office: 'MDRRMO',
  role: 'supervisor',
};
const SYSTEM_ADMIN: AdminSession = {
  adminId: 3,
  email: 'sysadmin@example.com',
  adminName: 'System Admin',
  office: null,
  role: 'system_admin',
};

// Same fake drizzle chain as admins.service.spec.ts — chains
// from/where/orderBy/values/set the way production code calls them, and
// resolves via .then like a real query-builder promise.
function chain(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.orderBy = self;
  obj.limit = self;
  obj.offset = self;
  obj.values = self;
  obj.set = self;
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

function makeDb() {
  const db: Record<string, unknown> = { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
  db.transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(db));
  return db as unknown as PostgresJsDatabase & {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
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
    ...overrides,
  };
}

describe('WorkOrdersService.parseQuery office scoping', () => {
  const db = makeDb();
  const { audit, notifications } = makeDeps();
  const service = new WorkOrdersService(db, notifications, audit);

  it('clamps an officer to their own office regardless of the query param', () => {
    expect(service.parseQuery({}, MEO_OFFICER).office).toBe('MEO');
    expect(service.parseQuery({ office: 'MDRRMO' }, MEO_OFFICER).office).toBe('MEO');
    expect(service.parseQuery({ office: 'all' }, MEO_OFFICER).office).toBe('MEO');
  });

  it('clamps a supervisor to their own office regardless of the query param', () => {
    expect(service.parseQuery({ office: 'MEO' }, MDRRMO_SUPERVISOR).office).toBe('MDRRMO');
  });

  it('defaults a system admin to city-wide (no office filter)', () => {
    expect(service.parseQuery({}, SYSTEM_ADMIN).office).toBeUndefined();
    expect(service.parseQuery({ office: 'all' }, SYSTEM_ADMIN).office).toBeUndefined();
  });

  it('lets a system admin request a specific office', () => {
    expect(service.parseQuery({ office: 'MDRRMO' }, SYSTEM_ADMIN).office).toBe('MDRRMO');
  });
});

describe('WorkOrdersService.parseQuery "My Assignments" (assignedAdminId=me)', () => {
  const db = makeDb();
  const { audit, notifications } = makeDeps();
  const service = new WorkOrdersService(db, notifications, audit);

  it('resolves "me" to the caller\'s own adminId, not a client-supplied id', () => {
    expect(service.parseQuery({ assignedAdminId: 'me' }, MEO_OFFICER).assignedAdminId).toBe(1);
    expect(service.parseQuery({ assignedAdminId: 'me' }, MDRRMO_SUPERVISOR).assignedAdminId).toBe(2);
  });

  it('resolves "me" for a system admin to their own adminId too, not city-wide/unfiltered', () => {
    expect(service.parseQuery({ assignedAdminId: 'me' }, SYSTEM_ADMIN).assignedAdminId).toBe(3);
  });

  it('still accepts a raw numeric assignedAdminId (unrelated existing behavior, unchanged)', () => {
    expect(service.parseQuery({ assignedAdminId: '7' }, MEO_OFFICER).assignedAdminId).toBe(7);
  });

  it('leaves assignedAdminId undefined when absent', () => {
    expect(service.parseQuery({}, MEO_OFFICER).assignedAdminId).toBeUndefined();
  });

  it('combines with office/status/overdue rather than replacing them', () => {
    const filters = service.parseQuery(
      { assignedAdminId: 'me', status: 'in_progress', overdue: 'true' },
      MEO_OFFICER,
    );
    expect(filters).toMatchObject({ office: 'MEO', assignedAdminId: 1, status: 'in_progress', overdue: true });
  });
});

describe('WorkOrdersService.create', () => {
  it('rejects a missing title before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ticketId: 5, title: '', notes: null, assignedAdminId: null, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects an invalid ticketId before touching the database', async () => {
    const db = makeDb();
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ticketId: 'not-a-number', title: 'Fix it', notes: null, assignedAdminId: null, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('blocks a MEO officer from creating a work order on an MDRRMO ticket (cross-office)', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain({ assignedOffice: 'MDRRMO' }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(
      service.create({ ticketId: 5, title: 'Fix it', notes: null, assignedAdminId: null, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a system admin to create a work order for any office and logs the audit event', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain({ assignedOffice: 'MDRRMO' }));
    db.insert.mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MDRRMO' })));
    const { audit, notifications, logInTx, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.create(
      { ticketId: 5, title: 'Fix it', notes: 'progress note', assignedAdminId: null, dueDate: null },
      SYSTEM_ADMIN,
    );
    expect(result.assigned_office).toBe('MDRRMO');
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ actionType: 'work_order_created', targetType: 'work_order' }),
    );
    // Office-wide notification (no assignedAdminId) rather than a targeted one.
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientOffice: 'MDRRMO', type: 'work_order_created' }),
    );
  });

  it('accepts a valid assignedAdminId (active, belongs to the ticket\'s office)', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain({ assignedOffice: 'MEO' })) // ticket lookup
      .mockReturnValueOnce(chain({ office: 'MEO', isActive: true })); // assignee lookup
    db.insert.mockReturnValueOnce(chain(workOrderRow({ assigned_admin_id: 7 })));
    const { audit, notifications, notifyCreate } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.create(
      { ticketId: 5, title: 'Fix it', notes: null, assignedAdminId: 7, dueDate: null },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBe(7);
    // Targeted notification, not office-wide, once a specific admin is assigned.
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 7, type: 'work_order_assigned' }),
    );
  });

  it('rejects assignedAdminId belonging to a different office than the ticket', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain({ assignedOffice: 'MEO' })) // ticket lookup
      .mockReturnValueOnce(chain({ office: 'MDRRMO', isActive: true })); // assignee is MDRRMO
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ticketId: 5, title: 'Fix it', notes: null, assignedAdminId: 7, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an inactive assignedAdminId even when the office matches', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain({ assignedOffice: 'MEO' }))
      .mockReturnValueOnce(chain({ office: 'MEO', isActive: false }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ticketId: 5, title: 'Fix it', notes: null, assignedAdminId: 7, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a nonexistent assignedAdminId', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain({ assignedOffice: 'MEO' }))
      .mockReturnValueOnce(chain([])); // no admin row found
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.create({ ticketId: 5, title: 'Fix it', notes: null, assignedAdminId: 999, dueDate: null }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('WorkOrdersService cross-office access to single-resource endpoints', () => {
  it('get() blocks an MDRRMO supervisor from reading a MEO work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.get(10, MDRRMO_SUPERVISOR)).rejects.toThrow(ForbiddenException);
  });

  it('get() throws NotFoundException for a missing work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.get(999, SYSTEM_ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('setStatus() rejects an unknown status value', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow()));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.setStatus(10, 'not-a-status', MEO_OFFICER)).rejects.toThrow(BadRequestException);
  });

  it('setStatus() blocks a MDRRMO admin from updating a MEO work order', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await expect(service.setStatus(10, 'completed', MDRRMO_SUPERVISOR)).rejects.toThrow(ForbiddenException);
  });

  it('setStatus() sets completed_at when transitioning to completed and logs work_order_completed', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow()));
    db.update.mockReturnValueOnce(chain(workOrderRow({ status: 'completed', completed_at: new Date() })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    const result = await service.setStatus(10, 'completed', MEO_OFFICER);
    expect(result.status).toBe('completed');
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ actionType: 'work_order_completed' }),
    );
  });

  it('update() never writes note bodies into audit metadata, only changed field names', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow()));
    db.update.mockReturnValueOnce(chain(workOrderRow({ notes: 'sensitive progress detail' })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);
    await service.update(10, { title: undefined, notes: 'sensitive progress detail', assignedAdminId: undefined, dueDate: undefined }, MEO_OFFICER);
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['notes'] } }),
    );
    const loggedMetadata = logInTx.mock.calls[0][1].metadata;
    expect(JSON.stringify(loggedMetadata)).not.toContain('sensitive progress detail');
  });

  it('update() changes the due date and logs only the field name, never the value, in audit metadata', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow()));
    db.update.mockReturnValueOnce(chain(workOrderRow({ due_date: new Date('2026-03-01T00:00:00Z') })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { title: undefined, notes: undefined, assignedAdminId: undefined, dueDate: '2026-03-01' },
      MEO_OFFICER,
    );
    expect(result.due_date).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['dueDate'] } }),
    );
  });

  it('update() clears the due date back to null when given an empty dueDate', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow({ due_date: new Date('2026-03-01T00:00:00Z') })));
    db.update.mockReturnValueOnce(chain(workOrderRow({ due_date: null })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { title: undefined, notes: undefined, assignedAdminId: undefined, dueDate: null },
      MEO_OFFICER,
    );
    expect(result.due_date).toBeNull();
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ metadata: { changedFields: ['dueDate'] } }),
    );
  });

  it('update() rejects an invalid due date', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow()));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { title: undefined, notes: undefined, assignedAdminId: undefined, dueDate: 'not-a-date' }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('update() accepts a valid assignedAdminId and logs its from/to in audit metadata', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO', assigned_admin_id: null })))
      .mockReturnValueOnce(chain({ office: 'MEO', isActive: true }));
    db.update.mockReturnValueOnce(chain(workOrderRow({ assigned_admin_id: 7 })));
    const { audit, notifications, logInTx } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { title: undefined, notes: undefined, assignedAdminId: 7, dueDate: undefined },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBe(7);
    expect(logInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        metadata: { changedFields: ['assignedAdminId'], assignedAdminId: { from: null, to: 7 } },
      }),
    );
  });

  it('update() rejects reassigning to an admin from a different office than the work order', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(chain({ office: 'MDRRMO', isActive: true }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { title: undefined, notes: undefined, assignedAdminId: 7, dueDate: undefined }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('update() rejects reassigning to an inactive admin', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO' })))
      .mockReturnValueOnce(chain({ office: 'MEO', isActive: false }));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(
      service.update(10, { title: undefined, notes: undefined, assignedAdminId: 7, dueDate: undefined }, MEO_OFFICER),
    ).rejects.toThrow(BadRequestException);
  });

  it('update() allows clearing assignedAdminId back to null (unassigned / office-wide) without validation', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain(workOrderRow({ assigned_office: 'MEO', assigned_admin_id: 7 })));
    db.update.mockReturnValueOnce(chain(workOrderRow({ assigned_admin_id: null })));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.update(
      10,
      { title: undefined, notes: undefined, assignedAdminId: null, dueDate: undefined },
      MEO_OFFICER,
    );
    expect(result.assigned_admin_id).toBeNull();
    // Only two selects (work order + nothing else) — no assignee lookup for a null clear.
    expect(db.select).toHaveBeenCalledTimes(1);
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
  // Verifies the three lists map to the right buckets and that a ticket
  // with more than one open work order is deduped, not repeated — office
  // scoping itself (the `office` filter is applied identically to every
  // other list/summary query in this service) is covered end-to-end in
  // e2e/admin-work-orders.spec.ts.
  it('maps the three independent queries to overdue/dueToday/highUrgency and dedupes repeated tickets', async () => {
    const db = makeDb();
    db.select
      .mockReturnValueOnce(chain([workOrderRow({ id: 1, due_date: new Date('2020-01-01') })]))
      .mockReturnValueOnce(chain([workOrderRow({ id: 2, due_date: new Date() })]))
      .mockReturnValueOnce(
        chain([
          { id: 100, category: 'Flooding', assigned_office: 'MEO', urgency_level: 'HIGH', priority_score: 90 },
          { id: 100, category: 'Flooding', assigned_office: 'MEO', urgency_level: 'HIGH', priority_score: 90 },
          { id: 101, category: 'Drainage', assigned_office: 'MEO', urgency_level: 'HIGH', priority_score: 80 },
        ]),
      );
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    const result = await service.getNeedsAttention('MEO');

    expect(result.overdueWorkOrders.map((w) => w.id)).toEqual([1]);
    expect(result.dueTodayWorkOrders.map((w) => w.id)).toEqual([2]);
    expect(result.highUrgencyTicketsWithOpenWork.map((t) => t.id)).toEqual([100, 101]);
    expect(db.select).toHaveBeenCalledTimes(3);
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
      highUrgencyTicketsWithOpenWork: [],
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

    await expect(service.getWorkOrdersForExport({ office: 'MDRRMO' })).resolves.toEqual([]);
  });

  it('defaults to no filters when called with no arguments', async () => {
    const db = makeDb();
    db.select.mockReturnValueOnce(chain([]));
    const { audit, notifications } = makeDeps();
    const service = new WorkOrdersService(db, notifications, audit);

    await expect(service.getWorkOrdersForExport()).resolves.toEqual([]);
  });
});
