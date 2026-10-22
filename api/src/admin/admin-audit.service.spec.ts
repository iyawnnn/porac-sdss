import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { AdminAuditService, type AdminAuditActor, type LogAdminAuditInput } from './admin-audit.service';

const ACTOR: AdminAuditActor = {
  adminId: 5,
  adminName: 'System Admin',
  email: 'sysadmin@example.com',
  accountType: 'SYSTEM_ADMIN',
  office: null,
};

// The object a mocked insert().values() was called with.
const valuesArg = (values: jest.Mock, call = 0) =>
  (values.mock.calls[call] as [Record<string, unknown>])[0];

// Renders a Drizzle SQL value the way the insert would send it.
function rendered(value: unknown) {
  expect(value).toBeInstanceOf(SQL);
  return new PgDialect().sqlToQuery(value as SQL);
}

function baseInput(overrides: Partial<LogAdminAuditInput> = {}): LogAdminAuditInput {
  return {
    actor: ACTOR,
    actionType: 'ticket_status_advanced',
    targetType: 'ticket',
    targetId: 7,
    targetSummary: 'Ticket #7 (Flooding)',
    metadata: { from: 'Reported', to: 'Under Review' },
    ...overrides,
  };
}

describe('AdminAuditService.logInPgTx', () => {
  it('inserts one row via the given raw-PG transaction, with the actor/action/target fields set', async () => {
    const calls: unknown[] = [];
    const tx = ((...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve([]);
    }) as unknown as TransactionSql;
    const service = new AdminAuditService({} as PostgresJsDatabase);

    await service.logInPgTx(tx, baseInput());

    expect(calls).toHaveLength(1);
    const [strings, ...values] = calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('')).toContain('INSERT INTO admin_audit_events');
    expect(values).toContain(ACTOR.adminId);
    expect(values).toContain('ticket_status_advanced');
    expect(values).toContain(7);
  });

  // Manuscript revision Phase 2, step 2e.
  it("sets actor_account_type from the actor and actor_role from the actor's stored admins.role", async () => {
    const calls: [TemplateStringsArray, ...unknown[]][] = [];
    const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push([strings, ...values]);
      return Promise.resolve([]);
    }) as unknown as TransactionSql;
    const service = new AdminAuditService({} as PostgresJsDatabase);

    await service.logInPgTx(tx, baseInput());

    const [strings, ...values] = calls[0];
    const text = strings.join('?');
    expect(text).toContain('actor_role, actor_account_type, actor_office');
    // actor_role is read from the admins row in the same INSERT, never
    // taken from the caller (the session has no role).
    expect(text).toContain('(SELECT role FROM admins WHERE id = ?)');
    expect(values.slice(0, 5)).toEqual([
      5,
      'System Admin',
      'sysadmin@example.com',
      5,
      'SYSTEM_ADMIN',
    ]);
    // Append-only: nothing here can rewrite an existing row's actor_role.
    expect(calls).toHaveLength(1);
    expect(text).not.toMatch(/\bUPDATE\b/);
  });
});

describe('AdminAuditService.logInTx', () => {
  it('inserts one row via the given Drizzle transaction with values() carrying the actor snapshot', async () => {
    const values = jest.fn().mockReturnValue(Promise.resolve());
    const insert = jest.fn().mockReturnValue({ values });
    const tx = { insert } as unknown as PostgresJsDatabase;
    const service = new AdminAuditService({} as PostgresJsDatabase);

    await service.logInTx(tx, baseInput({ actionType: 'admin_created', targetType: 'admin', targetId: 42 }));

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: ACTOR.adminId,
        actorName: ACTOR.adminName,
        actorEmail: ACTOR.email,
        actorAccountType: 'SYSTEM_ADMIN',
        actorOffice: ACTOR.office,
        actionType: 'admin_created',
        targetType: 'admin',
        targetId: 42,
      }),
    );
    // actor_role: the actor's stored admins.role mirror, read in the insert.
    expect(rendered(valuesArg(values).actorRole)).toMatchObject({
      sql: '(SELECT role FROM admins WHERE id = $1)',
      params: [5],
    });
  });

  it('Personnel and Focal actors are both written as PERSONNEL', async () => {
    const values = jest.fn().mockReturnValue(Promise.resolve());
    const tx = {
      insert: jest.fn().mockReturnValue({ values }),
    } as unknown as PostgresJsDatabase;
    const service = new AdminAuditService({} as PostgresJsDatabase);

    for (const office of ['MEO', 'MDRRMO'] as const) {
      await service.logInTx(
        tx,
        baseInput({
          actor: { ...ACTOR, adminId: 8, accountType: 'PERSONNEL', office },
        }),
      );
    }

    expect([0, 1].map((i) => valuesArg(values, i).actorAccountType)).toEqual([
      'PERSONNEL',
      'PERSONNEL',
    ]);
    expect(rendered(valuesArg(values).actorRole).params).toEqual([8]);
  });
});

describe('AdminAuditService.logBestEffort', () => {
  it('inserts one row via the plain (non-transactional) db client, same shape as logInTx', async () => {
    const values = jest.fn().mockReturnValue(Promise.resolve());
    const insert = jest.fn().mockReturnValue({ values });
    const db = { insert } as unknown as PostgresJsDatabase;
    const service = new AdminAuditService(db);

    await service.logBestEffort(
      baseInput({ actionType: 'admin_login', targetType: 'admin', targetId: 5 }),
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: ACTOR.adminId,
        actorAccountType: 'SYSTEM_ADMIN',
        actionType: 'admin_login',
        targetType: 'admin',
        targetId: 5,
      }),
    );
    expect(rendered(valuesArg(values).actorRole).sql).toBe(
      '(SELECT role FROM admins WHERE id = $1)',
    );
  });

  it('swallows an insert failure instead of rejecting, so a broken audit write never blocks the caller', async () => {
    const insert = jest.fn().mockReturnValue({
      values: () => {
        throw new Error('db is down');
      },
    });
    const db = { insert } as unknown as PostgresJsDatabase;
    const service = new AdminAuditService(db);

    await expect(
      service.logBestEffort(baseInput({ actionType: 'admin_login_failed', targetType: 'admin' })),
    ).resolves.toBeUndefined();
  });
});

describe('AdminAuditService.parseFilters', () => {
  const service = new AdminAuditService({} as PostgresJsDatabase);

  it('accepts a known action type and target type', () => {
    const filters = service.parseFilters({ actionType: 'ticket_reassigned', targetType: 'ticket' });
    expect(filters.actionType).toBe('ticket_reassigned');
    expect(filters.targetType).toBe('ticket');
  });

  it('drops an unknown action type or target type', () => {
    const filters = service.parseFilters({ actionType: 'bogus', targetType: 'bogus' });
    expect(filters.actionType).toBeUndefined();
    expect(filters.targetType).toBeUndefined();
  });

  it('defaults page to 1 and limit to 25 when absent or invalid', () => {
    expect(service.parseFilters({}).page).toBe(1);
    expect(service.parseFilters({}).limit).toBe(25);
    expect(service.parseFilters({ limit: '999' }).limit).toBe(25);
  });

  it('accepts a valid page limit', () => {
    expect(service.parseFilters({ limit: '100' }).limit).toBe(100);
  });

  it('parses actorAdminId as a number', () => {
    expect(service.parseFilters({ actorAdminId: '9' }).actorAdminId).toBe(9);
  });
});
