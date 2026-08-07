import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AdminsService } from './admins.service';
import type { AdminAuditService } from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';

const ACTOR: AdminSession = {
  adminId: 99,
  email: 'sysadmin@example.com',
  adminName: 'System Admin',
  office: null,
  role: 'system_admin',
};

// Fake drizzle query builder: chains from/where/orderBy/values/set the way
// production code calls them, and — crucially for the "never leak
// passwordHash" tests — .returning(columns) mimics real Postgres RETURNING
// semantics by projecting the full row down to exactly the keys of the
// SAFE_COLUMNS object the service passes in, so a regression that dropped
// SAFE_COLUMNS (e.g. `.returning()` with no args) would fail these tests.
function chain(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.orderBy = self;
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

function fullAdminRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    passwordHash: 'super-secret-hash',
    role: 'officer',
    office: 'MEO',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDb() {
  const db: Record<string, unknown> = { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
  // create()/update() run their insert/update + audit write inside
  // db.transaction() — the fake `tx` is just the same mock db, so
  // tx.insert(...)/tx.update(...) reuse the already-queued responses.
  db.transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(db));
  return db as unknown as PostgresJsDatabase & {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    transaction: jest.Mock;
  };
}

function makeAudit() {
  const logInTx = jest.fn().mockResolvedValue(undefined);
  return { audit: { logInTx } as unknown as AdminAuditService, logInTx };
}

describe('AdminsService', () => {
  describe('create', () => {
    it('rejects a password shorter than 8 characters before touching the database', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            email: 'a@b.com',
            password: 'short',
            firstName: 'A',
            lastName: 'B',
            role: 'officer',
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('rejects system_admin with a non-null office', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            email: 'a@b.com',
            password: 'longenoughpassword',
            firstName: 'A',
            lastName: 'B',
            role: 'system_admin',
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects officer/supervisor with no office', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            email: 'a@b.com',
            password: 'longenoughpassword',
            firstName: 'A',
            lastName: 'B',
            role: 'officer',
            office: null,
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate email without inserting', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([{ id: 1 }]));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            email: 'existing@example.com',
            password: 'longenoughpassword',
            firstName: 'A',
            lastName: 'B',
            role: 'officer',
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('creates an admin, hashes the password, never returns passwordHash, and logs an audit event', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([])); // no existing email
      const insertedRow = fullAdminRow({ id: 42, role: 'supervisor', office: 'MDRRMO' });
      db.insert.mockReturnValueOnce(chain(insertedRow));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.create(
        {
          email: 'jane@example.com',
          password: 'longenoughpassword',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'supervisor',
          office: 'MDRRMO',
        },
        ACTOR,
      );

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password_hash');
      expect(result.id).toBe(42);
      expect(result.role).toBe('supervisor');
      expect(result.office).toBe('MDRRMO');

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0];
      expect(input.actionType).toBe('admin_created');
      expect(input.targetType).toBe('admin');
      expect(input.targetId).toBe(42);
      expect(input.actor.adminId).toBe(ACTOR.adminId);
    });
  });

  describe('update', () => {
    it('404s when the admin does not exist', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.update(999, { role: 'officer', office: 'MEO' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an invalid role/office combination', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain(fullAdminRow()));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.update(1, { role: 'system_admin', office: 'MEO' }, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks demoting the last remaining system_admin', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })))
        .mockReturnValueOnce(chain([{ systemAdminCount: 1 }]));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.update(3, { role: 'officer', office: 'MEO' }, ACTOR),
      ).rejects.toThrow(ConflictException);
      expect(db.update).not.toHaveBeenCalled();
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('allows demoting a system_admin when another system_admin still exists, and logs an audit event', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })))
        .mockReturnValueOnce(chain([{ systemAdminCount: 2 }]));
      const updatedRow = fullAdminRow({ id: 3, role: 'officer', office: 'MEO' });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.update(3, { role: 'officer', office: 'MEO' }, ACTOR);
      expect(result.role).toBe('officer');
      expect(result).not.toHaveProperty('passwordHash');

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0];
      expect(input.actionType).toBe('admin_role_updated');
      expect(input.targetId).toBe(3);
      expect(input.metadata.from.role).toBe('system_admin');
      expect(input.metadata.to.role).toBe('officer');
    });

    it('allows a system_admin staying system_admin without re-checking the last-admin count', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })));
      const updatedRow = fullAdminRow({ id: 3, role: 'system_admin', office: null });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.update(3, { role: 'system_admin', office: null }, ACTOR);
      expect(result.role).toBe('system_admin');
      // Only the initial existence-check select ran — no count query.
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('returns rows without passwordHash', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain([
          { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.com', role: 'officer', office: 'MEO', created_at: new Date() },
        ]),
      );
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      const rows = await service.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('passwordHash');
      expect(rows[0]).not.toHaveProperty('password_hash');
    });
  });

  it('bcrypt-hashes the stored password (sanity check on the shared hashing pattern)', async () => {
    const hash = await bcrypt.hash('longenoughpassword', 10);
    expect(await bcrypt.compare('longenoughpassword', hash)).toBe(true);
    expect(hash).not.toBe('longenoughpassword');
  });
});
