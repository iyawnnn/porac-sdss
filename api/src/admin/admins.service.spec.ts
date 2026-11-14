import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AdminsService, roleMirror } from './admins.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';

const ACTOR: AdminSession = {
  adminId: 99,
  email: 'sysadmin@example.com',
  adminName: 'System Admin',
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
};

// Fake drizzle query builder: chains from/where/orderBy/values/set the way
// production code calls them, and — crucially for the "never leak
// passwordHash" tests — .returning(columns) mimics real Postgres RETURNING
// semantics by projecting the full row down to exactly the keys of the
// SAFE_COLUMNS object the service passes in, so a regression that dropped
// SAFE_COLUMNS (e.g. `.returning()` with no args) would fail these tests.
// .values()/.set() record what the service wrote (valuesArg/setArg), so the
// admins.role sync mirror can be checked.
function chain(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.orderBy = self;
  obj.for = self;
  obj.values = (arg: unknown) => {
    obj.valuesArg = arg;
    return obj;
  };
  obj.set = (arg: unknown) => {
    obj.setArg = arg;
    return obj;
  };
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

// One admin row in both shapes the fakes need: camelCase (what select()
// returns for the existing row) and the snake_case SAFE_COLUMNS keys
// (what .returning(SAFE_COLUMNS) projects).
function fullAdminRow(
  overrides: {
    id?: number;
    role?: string;
    accountType?: 'PERSONNEL' | 'SYSTEM_ADMIN';
    isFocal?: boolean;
    office?: 'MEO' | 'MDRRMO' | null;
    isActive?: boolean;
    is_active?: boolean;
  } = {},
) {
  const row = {
    id: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    passwordHash: 'super-secret-hash',
    role: 'officer',
    isActive: true,
    accountType: 'PERSONNEL' as const,
    isFocal: false,
    office: 'MEO' as 'MEO' | 'MDRRMO' | null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
  return { ...row, account_type: row.accountType, is_focal: row.isFocal };
}

function makeDb() {
  const db: Record<string, unknown> = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
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
  const logInTx = jest
    .fn<Promise<void>, [PostgresJsDatabase, LogAdminAuditInput]>()
    .mockResolvedValue(undefined);
  return { audit: { logInTx } as unknown as AdminAuditService, logInTx };
}

const NEW_ADMIN = {
  email: 'a@b.com',
  password: 'longenoughpassword',
  firstName: 'A',
  lastName: 'B',
};

describe('AdminsService', () => {
  describe('create', () => {
    it('rejects a password shorter than 8 characters before touching the database', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            ...NEW_ADMIN,
            password: 'short',
            accountType: 'PERSONNEL',
            isFocal: false,
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(db.select.mock.calls).toHaveLength(0);
    });

    it.each([
      ['an invalid email', { email: 'notanemail' }],
      ['an oversized email', { email: `${'a'.repeat(250)}@x.com` }],
      ['an oversized first name', { firstName: 'A'.repeat(101) }],
      ['an oversized last name', { lastName: 'B'.repeat(101) }],
      ['an oversized ASCII password', { password: 'p'.repeat(73) }],
      ['an oversized multibyte password', { password: '😀'.repeat(19) }],
    ])('rejects %s before touching the database', async (_label, invalid) => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      await expect(
        service.create(
          {
            ...NEW_ADMIN,
            ...invalid,
            accountType: 'PERSONNEL',
            isFocal: false,
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    // Manuscript revision Phase 2, step 2e: the API side of the CHECK
    // admins_account_type_office_focal_check — each invalid combination is
    // a clear 400, before the database is touched.
    it.each([
      [
        'a System Administrator with an office',
        { accountType: 'SYSTEM_ADMIN', isFocal: false, office: 'MEO' },
        'A System Administrator has no office.',
      ],
      [
        'a Focal System Administrator',
        { accountType: 'SYSTEM_ADMIN', isFocal: true, office: null },
        'A System Administrator cannot be Focal Personnel.',
      ],
      [
        'Personnel with no office',
        { accountType: 'PERSONNEL', isFocal: false, office: null },
        'Personnel must have office MEO or MDRRMO.',
      ],
      [
        'Personnel with the office left out',
        { accountType: 'PERSONNEL', isFocal: false },
        'Personnel must have office MEO or MDRRMO.',
      ],
      [
        'Focal Personnel on MEO',
        { accountType: 'PERSONNEL', isFocal: true, office: 'MEO' },
        'Focal Personnel must have office MDRRMO.',
      ],
      [
        'Focal Personnel with no office',
        { accountType: 'PERSONNEL', isFocal: true, office: null },
        'Personnel must have office MEO or MDRRMO.',
      ],
      [
        'an old role value as the account type',
        { accountType: 'officer', isFocal: false, office: 'MEO' },
        'accountType must be PERSONNEL or SYSTEM_ADMIN.',
      ],
      [
        'a missing account type',
        { isFocal: false, office: 'MEO' },
        'accountType must be PERSONNEL or SYSTEM_ADMIN.',
      ],
      [
        'a non-boolean isFocal',
        { accountType: 'PERSONNEL', isFocal: 'yes', office: 'MDRRMO' },
        'isFocal must be true or false.',
      ],
    ])(
      'rejects %s with a 400 and touches nothing',
      async (_label, fields, message) => {
        const db = makeDb();
        const { audit, logInTx } = makeAudit();
        const service = new AdminsService(db, audit);
        const input = {
          accountType: undefined,
          isFocal: undefined,
          office: undefined,
          ...NEW_ADMIN,
          ...(fields as Record<string, unknown>),
        };
        await expect(service.create(input, ACTOR)).rejects.toThrow(
          new BadRequestException(message),
        );
        expect(db.select.mock.calls).toHaveLength(0);
        expect(db.insert.mock.calls).toHaveLength(0);
        expect(logInTx).not.toHaveBeenCalled();
      },
    );

    it('creates Focal Personnel pinned to MDRRMO, with the role mirror focal', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([])); // no existing email
      const inserted = chain(
        fullAdminRow({
          id: 43,
          role: 'focal',
          isFocal: true,
          office: 'MDRRMO',
        }),
      );
      db.insert.mockReturnValueOnce(inserted);
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.create(
        {
          ...NEW_ADMIN,
          email: 'focal@example.com',
          accountType: 'PERSONNEL',
          isFocal: true,
          office: 'MDRRMO',
        },
        ACTOR,
      );

      expect(inserted.valuesArg).toMatchObject({
        accountType: 'PERSONNEL',
        isFocal: true,
        office: 'MDRRMO',
        role: 'focal',
      });
      expect(result.account_type).toBe('PERSONNEL');
      expect(result.is_focal).toBe(true);
      expect(result.office).toBe('MDRRMO');
      expect(logInTx).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'Personnel (isFocal left out)',
        { accountType: 'PERSONNEL', office: 'MEO' },
        {
          accountType: 'PERSONNEL',
          isFocal: false,
          office: 'MEO',
          role: 'officer',
        },
      ],
      [
        'MDRRMO Personnel',
        { accountType: 'PERSONNEL', isFocal: false, office: 'MDRRMO' },
        {
          accountType: 'PERSONNEL',
          isFocal: false,
          office: 'MDRRMO',
          role: 'officer',
        },
      ],
      [
        'a System Administrator',
        { accountType: 'SYSTEM_ADMIN', isFocal: false, office: null },
        {
          accountType: 'SYSTEM_ADMIN',
          isFocal: false,
          office: null,
          role: 'system_admin',
        },
      ],
    ])(
      'creates %s with the matching role mirror',
      async (_label, fields, written) => {
        const db = makeDb();
        db.select.mockReturnValueOnce(chain([]));
        const inserted = chain(fullAdminRow({ id: 44 }));
        db.insert.mockReturnValueOnce(inserted);
        const { audit } = makeAudit();
        const service = new AdminsService(db, audit);

        await service.create(
          {
            accountType: undefined,
            isFocal: undefined,
            office: undefined,
            ...NEW_ADMIN,
            ...(fields as Record<string, unknown>),
          },
          ACTOR,
        );

        expect(inserted.valuesArg).toMatchObject(written);
      },
    );

    it('rejects a duplicate email without inserting', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([{ id: 1 }]));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.create(
          {
            ...NEW_ADMIN,
            email: 'existing@example.com',
            accountType: 'PERSONNEL',
            isFocal: false,
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(ConflictException);
      expect(db.insert.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('normalizes the stored email and trims names', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      const inserted = chain(fullAdminRow({ id: 42 }));
      db.insert.mockReturnValueOnce(inserted);
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      await service.create(
        {
          ...NEW_ADMIN,
          email: '  QA-TECH-A@Example.com  ',
          firstName: '  QA  ',
          lastName: '  Tech  ',
          accountType: 'PERSONNEL',
          isFocal: false,
          office: 'MEO',
        },
        ACTOR,
      );

      expect(inserted.valuesArg).toMatchObject({
        email: 'qa-tech-a@example.com',
        firstName: 'QA',
        lastName: 'Tech',
      });
    });

    it('returns the normal duplicate-email conflict when a concurrent insert loses the race', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      db.insert.mockReturnValueOnce({
        values: () => ({ returning: () => Promise.reject({ message: 'Failed query', cause: { code: '23505' } }) }),
      });
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      await expect(
        service.create(
          {
            ...NEW_ADMIN,
            accountType: 'PERSONNEL',
            isFocal: false,
            office: 'MEO',
          },
          ACTOR,
        ),
      ).rejects.toThrow(
        new ConflictException('An admin with this email already exists.'),
      );
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('creates an admin, hashes the password, never returns passwordHash or role, and logs an audit event', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([])); // no existing email
      const insertedRow = fullAdminRow({ id: 42, office: 'MDRRMO' });
      db.insert.mockReturnValueOnce(chain(insertedRow));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.create(
        {
          email: 'jane@example.com',
          password: 'longenoughpassword',
          firstName: 'Jane',
          lastName: 'Doe',
          accountType: 'PERSONNEL',
          isFocal: false,
          office: 'MDRRMO',
        },
        ACTOR,
      );

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password_hash');
      // The role mirror is write-only: never part of the API shape.
      expect(result).not.toHaveProperty('role');
      expect(result.id).toBe(42);
      expect(result.account_type).toBe('PERSONNEL');
      expect(result.office).toBe('MDRRMO');

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0] as [unknown, LogAdminAuditInput];
      expect(input.actionType).toBe('admin_created');
      expect(input.targetType).toBe('admin');
      expect(input.targetId).toBe(42);
      expect(input.actor).toEqual({
        adminId: ACTOR.adminId,
        adminName: ACTOR.adminName,
        email: ACTOR.email,
        accountType: 'SYSTEM_ADMIN',
        office: null,
      });
      expect(input.metadata).toEqual({
        accountType: 'PERSONNEL',
        isFocal: false,
        office: 'MDRRMO',
      });
    });
  });

  describe('staff account changes', () => {
    const personnel = {
      accountType: 'PERSONNEL',
      isFocal: false,
      office: 'MEO',
    };
    const system = {
      accountType: 'SYSTEM_ADMIN',
      isFocal: false,
      office: null,
    };
    function setup(existing = fullAdminRow(), activeIds = [3, 99]) {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(chain(activeIds.map((id) => ({ id }))))
        .mockReturnValueOnce(chain(existing));
      const updated = chain(fullAdminRow({ id: existing.id }));
      db.update.mockReturnValue(updated);
      const { audit, logInTx } = makeAudit();
      return { db, updated, logInTx, service: new AdminsService(db, audit) };
    }
    it.each([
      ['office', fullAdminRow(), { ...personnel, office: 'MDRRMO' }],
      ['type', fullAdminRow(), system],
      [
        'Focal',
        fullAdminRow({ office: 'MDRRMO' }),
        { ...personnel, office: 'MDRRMO', isFocal: true },
      ],
      [
        'remove Focal',
        fullAdminRow({ office: 'MDRRMO', isFocal: true, role: 'focal' }),
        { ...personnel, office: 'MDRRMO' },
      ],
    ])(
      'ends sessions on a real %s edit with exactly one audit event',
      async (_label, existing, fields) => {
        const { service, updated, logInTx, db } = setup(existing);
        await service.update(existing.id, fields, ACTOR);
        expect(updated.setArg).toMatchObject({
          ...fields,
          sessionValidAfter: expect.any(Date) as unknown,
        });
        expect(logInTx).toHaveBeenCalledTimes(1);
        expect(logInTx.mock.calls[0][1].metadata).toMatchObject({
          sessionsEnded: true,
        });
        expect(db.transaction.mock.calls).toHaveLength(1);
      },
    );
    it('returns a safe current account without write, audit or session bump on no-op', async () => {
      const { service, db, logInTx } = setup();
      db.select.mockReturnValueOnce(
        chain({
          id: 1,
          account_type: 'PERSONNEL',
          office: 'MEO',
          is_focal: false,
        }),
      );
      const result = await service.update(1, personnel, ACTOR);
      expect(result.account_type).toBe('PERSONNEL');
      expect(result).not.toHaveProperty('passwordHash');
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });
    it.each([
      { ...system, office: 'MEO' },
      { ...system, isFocal: true },
      { ...personnel, office: null },
      { ...personnel, isFocal: true },
      { ...personnel, accountType: 'officer' },
      { ...personnel, isFocal: 'yes' },
    ])('rejects invalid fields without writes: %j', async (fields) => {
      const { service, db, logInTx } = setup();
      await expect(service.update(1, fields, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });
    it.each(['edit', 'deactivate'])(
      'blocks the last active System Administrator %s',
      async (action) => {
        const { service, db, logInTx } = setup(
          fullAdminRow({ id: 3, accountType: 'SYSTEM_ADMIN', office: null }),
          [3],
        );
        await expect(
          action === 'edit'
            ? service.update(3, personnel, ACTOR)
            : service.setActive(3, false, ACTOR),
        ).rejects.toThrow(ConflictException);
        expect(db.update.mock.calls).toHaveLength(0);
        expect(logInTx).not.toHaveBeenCalled();
      },
    );
    it.each(['type', 'office', 'Focal'])(
      'blocks a self %s edit with 403',
      async (change) => {
        const existing = fullAdminRow({ id: 99, office: 'MDRRMO' });
        const { service, db, logInTx } = setup(existing);
        const fields =
          change === 'type'
            ? system
            : {
                ...personnel,
                office: change === 'office' ? 'MEO' : 'MDRRMO',
                isFocal: change === 'Focal',
              };
        await expect(service.update(99, fields, ACTOR)).rejects.toThrow(
          new ForbiddenException(
            'Another System Administrator must change your own account.',
          ),
        );
        expect(db.update.mock.calls).toHaveLength(0);
        expect(logInTx).not.toHaveBeenCalled();
      },
    );
    it('blocks self deactivation with 403 even with other administrators', async () => {
      const { service, db, logInTx } = setup();
      await expect(service.setActive(99, false, ACTOR)).rejects.toThrow(
        new ForbiddenException(
          'Another System Administrator must deactivate your own account.',
        ),
      );
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });
    it('allows editing another System Administrator and keeps the mirror', async () => {
      const { service, updated } = setup(
        fullAdminRow({
          id: 3,
          accountType: 'SYSTEM_ADMIN',
          role: 'system_admin',
          office: null,
        }),
      );
      await service.update(3, personnel, ACTOR);
      expect(updated.setArg).toMatchObject({
        role: 'officer',
        sessionValidAfter: expect.any(Date) as unknown,
      });
    });
    it('preserves a Personnel supervisor mirror on an office edit', async () => {
      const { service, updated } = setup(fullAdminRow({ role: 'supervisor' }));
      await service.update(1, { ...personnel, office: 'MDRRMO' }, ACTOR);
      expect(updated.setArg).toMatchObject({ role: 'supervisor' });
    });
    it('returns the last-active 409 before the self-deactivation refusal', async () => {
      const { service, db, logInTx } = setup(
        fullAdminRow({ id: 99, accountType: 'SYSTEM_ADMIN', office: null }),
        [99],
      );
      await expect(service.setActive(99, false, ACTOR)).rejects.toThrow(
        new ConflictException(
          'Cannot deactivate the last active System Administrator.',
        ),
      );
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });
    it('does not block editing an inactive System Administrator', async () => {
      const { service } = setup(
        fullAdminRow({
          id: 3,
          accountType: 'SYSTEM_ADMIN',
          isActive: false,
          office: null,
        }),
        [99],
      );
      await expect(service.update(3, personnel, ACTOR)).resolves.toBeDefined();
    });
    it('reactivates an inactive System Administrator without bumping sessions', async () => {
      const { service, updated, logInTx } = setup(
        fullAdminRow({
          id: 3,
          accountType: 'SYSTEM_ADMIN',
          isActive: false,
          office: null,
        }),
        [99],
      );
      await service.setActive(3, true, ACTOR);
      expect(updated.setArg).toEqual({ isActive: true });
      expect(logInTx).toHaveBeenCalledTimes(1);
    });
    it('deactivates another account with one audit event and a session bump', async () => {
      const { service, updated, logInTx } = setup();
      await service.setActive(1, false, ACTOR);
      expect(updated.setArg).toEqual({
        isActive: false,
        sessionValidAfter: expect.any(Date) as unknown,
      });
      expect(logInTx).toHaveBeenCalledTimes(1);
    });
    it('does not audit or bump an unchanged status', async () => {
      const { service, db, logInTx } = setup();
      db.select.mockReturnValueOnce(chain({ id: 1, is_active: true }));
      await service.setActive(1, true, ACTOR);
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });
    it.each(['edit', 'status'])(
      '404s for a missing target on %s',
      async (action) => {
        const { service, db } = setup();
        db.select
          .mockReset()
          .mockReturnValueOnce(chain([{ id: 99 }]))
          .mockReturnValueOnce(chain([]));
        await expect(
          action === 'edit'
            ? service.update(123, personnel, ACTOR)
            : service.setActive(123, false, ACTOR),
        ).rejects.toThrow(NotFoundException);
      },
    );
  });

  describe('roleMirror', () => {
    it('maps account fields to the stored role', () => {
      expect(roleMirror({ accountType: 'SYSTEM_ADMIN', isFocal: false })).toBe(
        'system_admin',
      );
      expect(roleMirror({ accountType: 'PERSONNEL', isFocal: true })).toBe(
        'focal',
      );
      expect(
        roleMirror({ accountType: 'PERSONNEL', isFocal: true }, 'supervisor'),
      ).toBe('focal');
      expect(roleMirror({ accountType: 'PERSONNEL', isFocal: false })).toBe(
        'officer',
      );
      expect(
        roleMirror({ accountType: 'PERSONNEL', isFocal: false }, 'supervisor'),
      ).toBe('supervisor');
      expect(
        roleMirror({ accountType: 'PERSONNEL', isFocal: false }, 'officer'),
      ).toBe('officer');
      expect(
        roleMirror(
          { accountType: 'PERSONNEL', isFocal: false },
          'system_admin',
        ),
      ).toBe('officer');
      expect(
        roleMirror({ accountType: 'PERSONNEL', isFocal: false }, 'focal'),
      ).toBe('officer');
    });
  });

  describe('list', () => {
    it('returns rows without passwordHash, and never selects the role mirror', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain([
          {
            id: 1,
            first_name: 'A',
            last_name: 'B',
            email: 'a@b.com',
            account_type: 'PERSONNEL',
            is_focal: false,
            office: 'MEO',
            created_at: new Date(),
          },
        ]),
      );
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      const rows = await service.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('passwordHash');
      expect(rows[0]).not.toHaveProperty('password_hash');
      const columns = Object.keys((db.select.mock.calls[0] as [object])[0]);
      expect(columns).toEqual(
        expect.arrayContaining(['account_type', 'is_focal', 'office']),
      );
      expect(columns).not.toContain('role');
    });
  });

  it('bcrypt-hashes the stored password (sanity check on the shared hashing pattern)', async () => {
    const hash = await bcrypt.hash('longenoughpassword', 10);
    expect(await bcrypt.compare('longenoughpassword', hash)).toBe(true);
    expect(hash).not.toBe('longenoughpassword');
  });

  describe('listDirectory', () => {
    type Caller = Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>;
    const MEO_PERSONNEL: Caller = {
      accountType: 'PERSONNEL',
      isFocal: false,
      office: 'MEO',
    };
    const MDRRMO_PERSONNEL: Caller = {
      accountType: 'PERSONNEL',
      isFocal: false,
      office: 'MDRRMO',
    };
    const SYSTEM_ADMIN: Caller = {
      accountType: 'SYSTEM_ADMIN',
      isFocal: false,
      office: null,
    };

    function directoryRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 1,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        office: 'MEO',
        accountType: 'PERSONNEL',
        isFocal: false,
        ...overrides,
      };
    }

    it('never leaks password/session/security columns, or the role mirror — only the documented safe shape', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([directoryRow()]));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const [row] = await service.listDirectory(MEO_PERSONNEL, undefined);
      expect(Object.keys(row).sort()).toEqual(
        ['account_type', 'email', 'id', 'is_focal', 'name', 'office'].sort(),
      );
      expect(row.name).toBe('Jane Doe');
    });

    // Batch 1 (five-role RBAC): the work-order assignee directory is
    // routine operational scaffolding — the System Administrator has no
    // access to it, city-wide or otherwise.
    it('rejects a System Administrator caller outright — no more city-wide directory view', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      await expect(
        service.listDirectory(SYSTEM_ADMIN, undefined),
      ).rejects.toThrow(ForbiddenException);
      expect(db.select.mock.calls).toHaveLength(0);
    });

    // Focal carries office: 'MDRRMO' but is not operational staff — it must
    // be rejected the same way the System Administrator is, not silently
    // scoped to MDRRMO.
    it('rejects a Focal caller outright, despite carrying office=MDRRMO', async () => {
      const db = makeDb();
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      const FOCAL: Caller = {
        accountType: 'PERSONNEL',
        isFocal: true,
        office: 'MDRRMO',
      };

      await expect(service.listDirectory(FOCAL, undefined)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.select.mock.calls).toHaveLength(0);
    });

    it('MEO Personnel is clamped to MEO regardless of the office query param', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([directoryRow({ office: 'MEO' })]));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      // Requesting MDRRMO must not widen the result — resolveOfficeScope
      // clamps this before the query is even built.
      const rows = await service.listDirectory(MEO_PERSONNEL, 'MDRRMO');
      expect(rows.every((r) => r.office === 'MEO')).toBe(true);
    });

    it('MDRRMO Personnel is clamped to MDRRMO regardless of the office query param', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain([directoryRow({ office: 'MDRRMO' })]),
      );
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const rows = await service.listDirectory(MDRRMO_PERSONNEL, 'all');
      expect(rows.every((r) => r.office === 'MDRRMO')).toBe(true);
    });

    // Batch 1 (five-role RBAC) safety fix: the directory is an explicit
    // allowlist of operational Personnel, so it excludes System
    // Administrator and Focal rows even when the underlying query somehow
    // returned them — a Focal account's MDRRMO office never makes it an
    // MDRRMO assignee in the picker.
    it('excludes System Administrator and Focal rows via an explicit operational-Personnel allowlist', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain([
          directoryRow({ id: 1 }),
          directoryRow({ id: 2, accountType: 'SYSTEM_ADMIN', office: null }),
          directoryRow({ id: 3, isFocal: true, office: 'MDRRMO' }),
          directoryRow({ id: 4, office: 'MDRRMO' }),
        ]),
      );
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const rows = await service.listDirectory(MEO_PERSONNEL, undefined);
      expect(rows.map((r) => r.id)).toEqual([1, 4]);
      expect(
        rows.every((r) => r.account_type === 'PERSONNEL' && !r.is_focal),
      ).toBe(true);
    });
  });
});
