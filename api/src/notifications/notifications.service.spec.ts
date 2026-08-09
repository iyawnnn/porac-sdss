import { NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { NotificationsService, type NotificationPrincipal } from './notifications.service';

// drizzle-orm's named exports are non-configurable (jest.spyOn can't
// redefine them in place), so wrapping them in a jest.mock module factory
// is the only way to observe calls while keeping the real implementation —
// jest.requireActual + jest.fn(actual.<fn>) preserves real SQL-building
// behavior, it just also records calls for these tests.
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    isNull: jest.fn(actual.isNull),
    isNotNull: jest.fn(actual.isNotNull),
    eq: jest.fn(actual.eq),
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const drizzleOrm = require('drizzle-orm') as {
  isNull: jest.Mock;
  isNotNull: jest.Mock;
  eq: jest.Mock;
};

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  // jest.fn(self) rather than plain `self` — still behaves identically
  // (returns obj so chaining keeps working) but lets tests inspect what
  // where() was called with, e.g. to assert status/type filters changed
  // the query.
  obj.where = jest.fn(self);
  obj.orderBy = self;
  obj.limit = self;
  obj.set = self;
  obj.values = self;
  obj.returning = () => Promise.resolve(result);
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeDb(overrides: {
  select?: jest.Mock;
  insert?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
}): PostgresJsDatabase {
  return {
    select: overrides.select ?? jest.fn().mockReturnValue(chain([])),
    insert: overrides.insert ?? jest.fn().mockReturnValue(chain(undefined)),
    update: overrides.update ?? jest.fn().mockReturnValue(chain([])),
    delete: overrides.delete ?? jest.fn().mockReturnValue(chain(undefined)),
  } as unknown as PostgresJsDatabase;
}

const citizenPrincipal: NotificationPrincipal = { type: 'citizen', citizenId: 1 };
const adminPrincipal: NotificationPrincipal = { type: 'admin', adminId: 5, office: 'MEO' };

describe('NotificationsService.createInTx', () => {
  it('inserts via the provided raw-tx client, not the standalone Drizzle client', async () => {
    const tx = jest.fn().mockResolvedValue(undefined) as unknown as TransactionSql;
    const db = makeDb({});
    const service = new NotificationsService(db);

    await service.createInTx(tx, {
      recipientType: 'citizen',
      recipientId: 1,
      type: 'report_received',
      title: 'Report received',
      message: 'We got your report.',
    });

    expect(tx).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.create', () => {
  it('inserts via the standalone Drizzle client', async () => {
    const insert = jest.fn().mockReturnValue(chain(undefined));
    const db = makeDb({ insert });
    const service = new NotificationsService(db);

    await service.create({
      recipientType: 'admin',
      recipientOffice: 'MEO',
      type: 'ticket_critical',
      title: 'Critical ticket',
      message: 'A ticket just became critical.',
    });

    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.listForPrincipal', () => {
  it('returns items and no nextCursor when fewer rows than the page size exist', async () => {
    const select = jest.fn().mockReturnValue(
      chain([
        { id: 3, recipientType: 'citizen', recipientId: 1 },
        { id: 2, recipientType: 'citizen', recipientId: 1 },
      ]),
    );
    const service = new NotificationsService(makeDb({ select }));

    const result = await service.listForPrincipal(citizenPrincipal, { limit: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor and drops the probe row when more rows exist than the page size', async () => {
    const rows = [{ id: 3 }, { id: 2 }, { id: 1 }]; // limit=2 -> 1 extra probe row
    const select = jest.fn().mockReturnValue(chain(rows));
    const service = new NotificationsService(makeDb({ select }));

    const result = await service.listForPrincipal(citizenPrincipal, { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe(2);
  });

  // The wrapped drizzle-orm functions (jest.mock above) accumulate call
  // history across tests in this file — mockClear() right before exercising
  // the code under test keeps each assertion scoped to its own call.
  function readAtCalled(mock: jest.Mock): boolean {
    return mock.mock.calls.some(([col]) => (col as { name?: string })?.name === 'read_at');
  }
  function typeCalledWith(mock: jest.Mock, value: string): boolean {
    return mock.mock.calls.some(([col, v]) => (col as { name?: string })?.name === 'type' && v === value);
  }

  it('applies no extra condition beyond scopeFilter when neither status nor type is passed', async () => {
    drizzleOrm.isNull.mockClear();
    drizzleOrm.isNotNull.mockClear();
    drizzleOrm.eq.mockClear();
    const select = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ select }));

    await service.listForPrincipal(adminPrincipal, {});

    // eq() is still called by scopeFilter itself (recipient_type/recipientId)
    // — the assertion is that readAt/type conditions are never added.
    expect(readAtCalled(drizzleOrm.isNull)).toBe(false);
    expect(readAtCalled(drizzleOrm.isNotNull)).toBe(false);
    expect(drizzleOrm.eq.mock.calls.some(([col]) => (col as { name?: string })?.name === 'type')).toBe(false);
  });

  it("status: 'unread' filters on readAt being null", async () => {
    drizzleOrm.isNull.mockClear();
    const select = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ select }));

    await service.listForPrincipal(adminPrincipal, { status: 'unread' });

    expect(readAtCalled(drizzleOrm.isNull)).toBe(true);
  });

  it("status: 'read' filters on readAt being not null", async () => {
    drizzleOrm.isNotNull.mockClear();
    const select = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ select }));

    await service.listForPrincipal(adminPrincipal, { status: 'read' });

    expect(readAtCalled(drizzleOrm.isNotNull)).toBe(true);
  });

  it('a type filter adds an equality condition on the type column', async () => {
    drizzleOrm.eq.mockClear();
    const select = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ select }));

    await service.listForPrincipal(adminPrincipal, { type: 'ticket_critical' });

    expect(typeCalledWith(drizzleOrm.eq, 'ticket_critical')).toBe(true);
  });

  it('status and type combine rather than override each other', async () => {
    drizzleOrm.isNull.mockClear();
    drizzleOrm.eq.mockClear();
    const select = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ select }));

    await service.listForPrincipal(adminPrincipal, { status: 'unread', type: 'work_order_assigned' });

    expect(readAtCalled(drizzleOrm.isNull)).toBe(true);
    expect(typeCalledWith(drizzleOrm.eq, 'work_order_assigned')).toBe(true);
  });
});

describe('NotificationsService.getUnreadCount', () => {
  it('counts only unread rows scoped to the principal', async () => {
    const select = jest.fn().mockReturnValue(chain([{ id: 1 }, { id: 2 }]));
    const service = new NotificationsService(makeDb({ select }));

    await expect(service.getUnreadCount(citizenPrincipal)).resolves.toBe(2);
  });
});

describe('NotificationsService.markRead — authorization', () => {
  it('marks a notification read when it belongs to the caller', async () => {
    const update = jest.fn().mockReturnValue(chain([{ id: 7 }]));
    const service = new NotificationsService(makeDb({ update }));

    await expect(service.markRead(citizenPrincipal, 7)).resolves.toBeUndefined();
  });

  it('throws NotFoundException when the notification does not belong to the caller (or does not exist) — same error either way', async () => {
    const update = jest.fn().mockReturnValue(chain([]));
    const service = new NotificationsService(makeDb({ update }));

    await expect(service.markRead(citizenPrincipal, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('an admin can mark read a notification scoped to their office, not just their own adminId', async () => {
    const update = jest.fn().mockReturnValue(chain([{ id: 4 }]));
    const service = new NotificationsService(makeDb({ update }));

    await expect(service.markRead(adminPrincipal, 4)).resolves.toBeUndefined();
  });
});

describe('NotificationsService.markAllRead', () => {
  it('updates without throwing regardless of how many rows are affected', async () => {
    const update = jest.fn().mockReturnValue(chain(undefined));
    const service = new NotificationsService(makeDb({ update }));

    await expect(service.markAllRead(citizenPrincipal)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.cleanupOldNotifications', () => {
  it('deletes without throwing', async () => {
    const del = jest.fn().mockReturnValue(chain(undefined));
    const service = new NotificationsService(makeDb({ delete: del }));

    await expect(service.cleanupOldNotifications()).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledTimes(1);
  });
});
