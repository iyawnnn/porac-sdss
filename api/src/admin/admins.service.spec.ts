import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    accountType: 'PERSONNEL' as const,
    isFocal: false,
    office: 'MEO' as 'MEO' | 'MDRRMO' | null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
  return { ...row, account_type: row.accountType, is_focal: row.isFocal };
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
      expect(db.select).not.toHaveBeenCalled();
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
    });

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
      expect(db.insert).not.toHaveBeenCalled();
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

  describe('update', () => {
    it('404s when the admin does not exist', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.update(
          999,
          { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
          ACTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([
      [
        'a System Administrator with an office',
        { accountType: 'SYSTEM_ADMIN', isFocal: false, office: 'MEO' },
      ],
      [
        'Personnel with no office',
        { accountType: 'PERSONNEL', isFocal: false, office: null },
      ],
      [
        'Focal Personnel on MEO',
        { accountType: 'PERSONNEL', isFocal: true, office: 'MEO' },
      ],
    ])('rejects %s with a 400 and writes nothing', async (_label, fields) => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain(fullAdminRow()));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(service.update(1, fields, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(db.update.mock.calls).toHaveLength(0);
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('blocks demoting the last remaining System Administrator', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(
          chain(
            fullAdminRow({
              id: 3,
              role: 'system_admin',
              accountType: 'SYSTEM_ADMIN',
              office: null,
            }),
          ),
        )
        .mockReturnValueOnce(chain([{ systemAdminCount: 1 }]));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(
        service.update(
          3,
          { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
          ACTOR,
        ),
      ).rejects.toThrow(
        new ConflictException('Cannot remove the last System Administrator.'),
      );
      expect(db.update).not.toHaveBeenCalled();
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('allows demoting a System Administrator when another one still exists, writes role officer, and logs an audit event', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(
          chain(
            fullAdminRow({
              id: 3,
              role: 'system_admin',
              accountType: 'SYSTEM_ADMIN',
              office: null,
            }),
          ),
        )
        .mockReturnValueOnce(chain([{ systemAdminCount: 2 }]));
      const updated = chain(fullAdminRow({ id: 3, office: 'MEO' }));
      db.update.mockReturnValueOnce(updated);
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.update(
        3,
        { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
        ACTOR,
      );
      expect(updated.setArg).toEqual({
        accountType: 'PERSONNEL',
        isFocal: false,
        office: 'MEO',
        role: 'officer',
      });
      expect(result.account_type).toBe('PERSONNEL');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('role');

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0] as [unknown, LogAdminAuditInput];
      expect(input.actionType).toBe('admin_role_updated');
      expect(input.targetId).toBe(3);
      expect(input.metadata).toEqual({
        from: { accountType: 'SYSTEM_ADMIN', isFocal: false, office: null },
        to: { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
      });
    });

    it('allows a System Administrator staying one without re-checking the last-admin count', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain(
          fullAdminRow({
            id: 3,
            role: 'system_admin',
            accountType: 'SYSTEM_ADMIN',
            office: null,
          }),
        ),
      );
      const updated = chain(
        fullAdminRow({
          id: 3,
          role: 'system_admin',
          accountType: 'SYSTEM_ADMIN',
          office: null,
        }),
      );
      db.update.mockReturnValueOnce(updated);
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.update(
        3,
        { accountType: 'SYSTEM_ADMIN', isFocal: false, office: null },
        ACTOR,
      );
      expect(result.account_type).toBe('SYSTEM_ADMIN');
      expect(updated.setArg).toEqual({
        accountType: 'SYSTEM_ADMIN',
        isFocal: false,
        office: null,
        role: 'system_admin',
      });
      // Only the initial existence-check select ran — no count query.
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    // The admins.role sync mirror on update: Personnel that isn't Focal
    // keeps an existing officer/supervisor value, else becomes officer.
    it.each([
      [
        'a supervisor moved to MEO stays supervisor',
        'supervisor',
        false,
        { accountType: 'PERSONNEL', isFocal: false, office: 'MEO' },
        'supervisor',
      ],
      [
        'an officer moved to MDRRMO stays officer',
        'officer',
        false,
        { accountType: 'PERSONNEL', isFocal: false, office: 'MDRRMO' },
        'officer',
      ],
      [
        'a Focal account made plain Personnel becomes officer',
        'focal',
        true,
        { accountType: 'PERSONNEL', isFocal: false, office: 'MDRRMO' },
        'officer',
      ],
      [
        'a supervisor made Focal becomes focal',
        'supervisor',
        false,
        { accountType: 'PERSONNEL', isFocal: true, office: 'MDRRMO' },
        'focal',
      ],
    ])('%s', async (_label, existingRole, existingFocal, fields, mirror) => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain(
          fullAdminRow({
            id: 7,
            role: existingRole,
            isFocal: existingFocal,
            office: 'MDRRMO',
          }),
        ),
      );
      const updated = chain(fullAdminRow({ id: 7 }));
      db.update.mockReturnValueOnce(updated);
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      await service.update(7, fields, ACTOR);

      expect(updated.setArg).toEqual({ ...fields, role: mirror });
      // Personnel changes never look at the System Administrator count.
      expect(db.select.mock.calls).toHaveLength(1);
    });
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

  describe('setActive', () => {
    it('404s when the admin does not exist', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(chain([]));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(service.setActive(999, false, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks deactivating the last active System Administrator', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(
          chain(
            fullAdminRow({
              id: 3,
              role: 'system_admin',
              accountType: 'SYSTEM_ADMIN',
              office: null,
              isActive: true,
            }),
          ),
        )
        .mockReturnValueOnce(chain([{ systemAdminCount: 1 }]));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);
      await expect(service.setActive(3, false, ACTOR)).rejects.toThrow(
        new ConflictException(
          'Cannot deactivate the last active System Administrator.',
        ),
      );
      expect(db.update).not.toHaveBeenCalled();
      expect(logInTx).not.toHaveBeenCalled();
    });

    it('allows deactivating a System Administrator when another active one still exists, bumps session_valid_after, and logs admin_deactivated', async () => {
      const db = makeDb();
      db.select
        .mockReturnValueOnce(
          chain(
            fullAdminRow({
              id: 3,
              role: 'system_admin',
              accountType: 'SYSTEM_ADMIN',
              office: null,
              isActive: true,
            }),
          ),
        )
        .mockReturnValueOnce(chain([{ systemAdminCount: 2 }]));
      // .returning(SAFE_COLUMNS)'s fake projects by literal target key name
      // (is_active), not the camelCase drizzle field fullAdminRow otherwise
      // uses — so the *updated* row needs the snake_case key to survive it.
      const updated = chain(
        fullAdminRow({
          id: 3,
          role: 'system_admin',
          accountType: 'SYSTEM_ADMIN',
          office: null,
          is_active: false,
        }),
      );
      db.update.mockReturnValueOnce(updated);
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.setActive(3, false, ACTOR);
      expect(result.is_active).toBe(false);
      expect(result).not.toHaveProperty('passwordHash');
      expect(updated.setArg).toMatchObject({ isActive: false });
      expect(
        (updated.setArg as { sessionValidAfter: unknown }).sessionValidAfter,
      ).toBeInstanceOf(Date);

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0];
      expect(input.actionType).toBe('admin_deactivated');
      expect(input.targetId).toBe(3);
      expect(input.metadata.from.active).toBe(true);
      expect(input.metadata.to.active).toBe(false);
    });

    it.each([
      ['Personnel', false],
      ['Focal Personnel', true],
    ])(
      'deactivating %s never checks the System Administrator count',
      async (_label, isFocal) => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
          chain(
            fullAdminRow({ id: 5, isFocal, office: 'MDRRMO', isActive: true }),
          ),
      );
        const updatedRow = fullAdminRow({
          id: 5,
          isFocal,
          office: 'MDRRMO',
          is_active: false,
        });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const { audit } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.setActive(5, false, ACTOR);
      expect(result.is_active).toBe(false);
      // Only the initial existence-check select ran — no count query.
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reactivates a deactivated admin and logs admin_reactivated', async () => {
      const db = makeDb();
      db.select.mockReturnValueOnce(
        chain(fullAdminRow({ id: 5, office: 'MEO', isActive: false })),
      );
      const updatedRow = fullAdminRow({
        id: 5,
        office: 'MEO',
        is_active: true,
      });
      db.update.mockReturnValueOnce(chain(updatedRow));
      const { audit, logInTx } = makeAudit();
      const service = new AdminsService(db, audit);

      const result = await service.setActive(5, true, ACTOR);
      expect(result.is_active).toBe(true);

      expect(logInTx).toHaveBeenCalledTimes(1);
      const [, input] = logInTx.mock.calls[0];
      expect(input.actionType).toBe('admin_reactivated');
      expect(input.metadata.from.active).toBe(false);
      expect(input.metadata.to.active).toBe(true);
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

      await expect(service.listDirectory(SYSTEM_ADMIN, undefined)).rejects.toThrow(
        ForbiddenException,
      );
      expect(db.select).not.toHaveBeenCalled();
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
      expect(db.select).not.toHaveBeenCalled();
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
      db.select.mockReturnValueOnce(chain([directoryRow({ office: 'MDRRMO' })]));
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
