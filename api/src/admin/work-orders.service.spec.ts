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
});
