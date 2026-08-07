import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { AdminAuditService, type AdminAuditActor, type LogAdminAuditInput } from './admin-audit.service';

const ACTOR: AdminAuditActor = {
  adminId: 5,
  adminName: 'System Admin',
  email: 'sysadmin@example.com',
  role: 'system_admin',
  office: null,
};

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
        actorRole: ACTOR.role,
        actorOffice: ACTOR.office,
        actionType: 'admin_created',
        targetType: 'admin',
        targetId: 42,
      }),
    );
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
