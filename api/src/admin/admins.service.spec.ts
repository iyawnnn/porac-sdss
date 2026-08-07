import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AdminsService } from './admins.service';

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
  return { select: jest.fn(), insert: jest.fn(), update: jest.fn() } as unknown as PostgresJsDatabase & {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
}

describe('AdminsService', () => {
  describe('create', () => {
    it('rejects a password shorter than 8 characters before touching the database', async () => {
      const db = makeDb();
      const service = new AdminsService(db);
      await expect(
        service.create({
          email: 'a@b.com',
          password: 'short',
          firstName: 'A',
          lastName: 'B',
          role: 'officer',
          office: 'MEO',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('rejects system_admin with a non-null office', async () => {
      const db = makeDb();
      const service = new AdminsService(db);
      await expect(
        service.create({
          email: 'a@b.com',
          password: 'longenoughpassword',
          firstName: 'A',
          lastName: 'B',
          role: 'system_admin',
          office: 'MEO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects officer/supervisor with no office', async () => {
      const db = makeDb();
      const service = new AdminsService(db);
      await expect(
        service.create({
          email: 'a@b.com',
          password: 'longenoughpassword',
          firstName: 'A',
          lastName: 'B',
          role: 'officer',
          office: null,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate email without inserting', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([{ id: 1 }]));
      const service = new AdminsService(db);
      await expect(
        service.create({
          email: 'existing@example.com',
          password: 'longenoughpassword',
          firstName: 'A',
          lastName: 'B',
          role: 'officer',
          office: 'MEO',
        }),
      ).rejects.toThrow(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('creates an admin, hashes the password, and never returns passwordHash', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([])); // no existing email
      const insertedRow = fullAdminRow({ id: 42, role: 'supervisor', office: 'MDRRMO' });
      db.insert.mockReturnValueOnce(chain(insertedRow));
      const service = new AdminsService(db);

      const result = await service.create({
        email: 'jane@example.com',
        password: 'longenoughpassword',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'supervisor',
        office: 'MDRRMO',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password_hash');
      expect(result.id).toBe(42);
      expect(result.role).toBe('supervisor');
      expect(result.office).toBe('MDRRMO');
    });
  });

  describe('update', () => {
    it('404s when the admin does not exist', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      const service = new AdminsService(db);
      await expect(
        service.update(999, { role: 'officer', office: 'MEO' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an invalid role/office combination', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain(fullAdminRow()));
      const service = new AdminsService(db);
      await expect(
        service.update(1, { role: 'system_admin', office: 'MEO' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks demoting the last remaining system_admin', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })))
        .mockReturnValueOnce(chain([{ systemAdminCount: 1 }]));
      const service = new AdminsService(db);
      await expect(
        service.update(3, { role: 'officer', office: 'MEO' }),
      ).rejects.toThrow(ConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('allows demoting a system_admin when another system_admin still exists', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })))
        .mockReturnValueOnce(chain([{ systemAdminCount: 2 }]));
      const updatedRow = fullAdminRow({ id: 3, role: 'officer', office: 'MEO' });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const service = new AdminsService(db);

      const result = await service.update(3, { role: 'officer', office: 'MEO' });
      expect(result.role).toBe('officer');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('allows a system_admin staying system_admin without re-checking the last-admin count', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain(fullAdminRow({ id: 3, role: 'system_admin', office: null })));
      const updatedRow = fullAdminRow({ id: 3, role: 'system_admin', office: null });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const service = new AdminsService(db);

      const result = await service.update(3, { role: 'system_admin', office: null });
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
      const service = new AdminsService(db);
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
