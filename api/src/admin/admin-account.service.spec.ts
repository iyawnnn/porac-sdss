import bcrypt from 'bcryptjs';
import { NotFoundException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  AdminAccountService,
  SelfResetNotAllowedError,
  WeakPasswordError,
  WrongPasswordError,
} from './admin-account.service';
import type { AdminAuditService } from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';

const ACTOR: AdminSession = {
  adminId: 1,
  email: 'officer@example.com',
  adminName: 'Officer One',
  office: 'MEO',
  role: 'officer',
};

// select() chain: from/where resolve via .then, mirroring the other
// admin service specs in this directory.
function selectChain(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return obj;
}

// update() chain, with .set as a real jest.fn so its call args (the
// hashed password / timestamps actually persisted) can be asserted on.
function makeUpdateMock() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn(() => ({ where }));
  const update = jest.fn(() => ({ set }));
  return { update, set, where };
}

function makeDb() {
  const { update, set } = makeUpdateMock();
  const db: Record<string, unknown> = { select: jest.fn(), update };
  db.transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(db));
  return {
    db: db as unknown as PostgresJsDatabase & { select: jest.Mock; transaction: jest.Mock },
    setMock: set,
  };
}

function makeAudit() {
  const logInTx = jest.fn().mockResolvedValue(undefined);
  return { audit: { logInTx } as unknown as AdminAuditService, logInTx };
}

describe('AdminAccountService.changeOwnPassword', () => {
  it('rejects a new password shorter than 8 characters before touching the database', async () => {
    const { db } = makeDb();
    const { audit } = makeAudit();
    const service = new AdminAccountService(db, audit);
    await expect(
      service.changeOwnPassword(ACTOR, { currentPassword: 'whatever', newPassword: 'short' }),
    ).rejects.toThrow(WeakPasswordError);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a missing current password before touching the database', async () => {
    const { db } = makeDb();
    const { audit } = makeAudit();
    const service = new AdminAccountService(db, audit);
    await expect(
      service.changeOwnPassword(ACTOR, { currentPassword: undefined, newPassword: 'longenoughpassword' }),
    ).rejects.toThrow(WrongPasswordError);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password without updating anything', async () => {
    const { db, setMock } = makeDb();
    const existingHash = await bcrypt.hash('correct-horse', 10);
    db.select.mockReturnValueOnce(selectChain({ passwordHash: existingHash }));
    const { audit, logInTx } = makeAudit();
    const service = new AdminAccountService(db, audit);

    await expect(
      service.changeOwnPassword(ACTOR, { currentPassword: 'wrong-password', newPassword: 'longenoughpassword' }),
    ).rejects.toThrow(WrongPasswordError);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(logInTx).not.toHaveBeenCalled();
  });

  it('hashes the new password, bumps session_valid_after, and audits — never storing the plaintext or old hash', async () => {
    const { db, setMock } = makeDb();
    const existingHash = await bcrypt.hash('correct-horse', 10);
    db.select.mockReturnValueOnce(selectChain({ passwordHash: existingHash }));
    const { audit, logInTx } = makeAudit();
    const service = new AdminAccountService(db, audit);

    await service.changeOwnPassword(ACTOR, {
      currentPassword: 'correct-horse',
      newPassword: 'a-brand-new-password',
    });

    expect(setMock).toHaveBeenCalledTimes(1);
    const setArgs = setMock.mock.calls[0][0];
    expect(setArgs.passwordHash).not.toBe('a-brand-new-password');
    expect(setArgs.passwordHash).not.toBe(existingHash);
    expect(await bcrypt.compare('a-brand-new-password', setArgs.passwordHash)).toBe(true);
    expect(setArgs.sessionValidAfter).toBeInstanceOf(Date);
    expect(setArgs.passwordChangedAt).toBeInstanceOf(Date);

    expect(logInTx).toHaveBeenCalledTimes(1);
    const [, input] = logInTx.mock.calls[0];
    expect(input.actionType).toBe('admin_password_changed');
    expect(input.targetType).toBe('admin');
    expect(input.targetId).toBe(ACTOR.adminId);
    expect(JSON.stringify(input)).not.toMatch(/a-brand-new-password|correct-horse/);
  });
});

describe('AdminAccountService.resetPassword', () => {
  it('rejects a system admin resetting their own row', async () => {
    const { db } = makeDb();
    const { audit, logInTx } = makeAudit();
    const service = new AdminAccountService(db, audit);
    await expect(
      service.resetPassword(ACTOR, ACTOR.adminId, 'longenoughpassword'),
    ).rejects.toThrow(SelfResetNotAllowedError);
    expect(db.select).not.toHaveBeenCalled();
    expect(logInTx).not.toHaveBeenCalled();
  });

  it('rejects a weak temporary password before touching the database', async () => {
    const { db } = makeDb();
    const { audit } = makeAudit();
    const service = new AdminAccountService(db, audit);
    await expect(service.resetPassword(ACTOR, 42, 'short')).rejects.toThrow(WeakPasswordError);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('404s when the target admin does not exist', async () => {
    const { db } = makeDb();
    db.select.mockReturnValueOnce(selectChain([]));
    const { audit } = makeAudit();
    const service = new AdminAccountService(db, audit);
    await expect(
      service.resetPassword(ACTOR, 999, 'longenoughpassword'),
    ).rejects.toThrow(NotFoundException);
  });

  it('hashes the temporary password, bumps the target session_valid_after, and audits with no secrets', async () => {
    const { db, setMock } = makeDb();
    db.select.mockReturnValueOnce(
      selectChain({ id: 42, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }),
    );
    const { audit, logInTx } = makeAudit();
    const service = new AdminAccountService(db, audit);

    await service.resetPassword(ACTOR, 42, 'a-temporary-password');

    expect(setMock).toHaveBeenCalledTimes(1);
    const setArgs = setMock.mock.calls[0][0];
    expect(await bcrypt.compare('a-temporary-password', setArgs.passwordHash)).toBe(true);
    expect(setArgs.sessionValidAfter).toBeInstanceOf(Date);

    expect(logInTx).toHaveBeenCalledTimes(1);
    const [, input] = logInTx.mock.calls[0];
    expect(input.actionType).toBe('admin_password_reset');
    expect(input.targetId).toBe(42);
    expect(input.targetSummary).toContain('jane@example.com');
    expect(input.metadata).toBeUndefined();
    expect(JSON.stringify(input)).not.toMatch(/a-temporary-password/);
  });
});
