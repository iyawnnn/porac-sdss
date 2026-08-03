import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  AccountService,
  FinalLoginMethodError,
  NotLinkedError,
  ReauthRequiredError,
  WeakPasswordError,
  WrongPasswordError,
} from './account.service';

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.set = self;
  obj.values = self;
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeDb(overrides: {
  select: jest.Mock;
  update?: jest.Mock;
  insert?: jest.Mock;
  transaction?: jest.Mock;
  delete?: jest.Mock;
}): PostgresJsDatabase {
  return {
    select: overrides.select,
    update: overrides.update ?? jest.fn().mockReturnValue(chain(undefined)),
    insert: overrides.insert ?? jest.fn().mockReturnValue(chain(undefined)),
    transaction:
      overrides.transaction ??
      jest.fn((cb: (tx: unknown) => unknown) =>
        cb({ delete: jest.fn().mockReturnValue(chain(undefined)) }),
      ),
    delete: overrides.delete,
  } as unknown as PostgresJsDatabase;
}

describe('AccountService.getSecurityStatus', () => {
  it('reports password + linked providers accurately', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: 'hash' }]))
      .mockReturnValueOnce(chain([{ provider: 'google' }]));
    const service = new AccountService(makeDb({ select }));

    await expect(service.getSecurityStatus(1)).resolves.toEqual({
      hasPassword: true,
      providers: { google: true },
    });
  });

  it('reports no password and no providers for a bare account', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]))
      .mockReturnValueOnce(chain([]));
    const service = new AccountService(makeDb({ select }));

    await expect(service.getSecurityStatus(1)).resolves.toEqual({
      hasPassword: false,
      providers: { google: false },
    });
  });
});

describe('AccountService.setOrChangePassword', () => {
  it('changes the password for an existing password user given the correct current password', async () => {
    const currentHash = await bcrypt.hash('old-password', 10);
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: currentHash }]));
    const update = jest.fn().mockReturnValue(chain(undefined));
    const insert = jest.fn().mockReturnValue(chain(undefined));
    const service = new AccountService(makeDb({ select, update, insert }));

    await expect(
      service.setOrChangePassword(
        1,
        { currentPassword: 'old-password', newPassword: 'new-password-123' },
        false,
      ),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong current password', async () => {
    const currentHash = await bcrypt.hash('old-password', 10);
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: currentHash }]));
    const update = jest.fn();
    const service = new AccountService(makeDb({ select, update }));

    await expect(
      service.setOrChangePassword(
        1,
        { currentPassword: 'wrong-password', newPassword: 'new-password-123' },
        false,
      ),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    expect(update).not.toHaveBeenCalled();
  });

  it('sets a password on an OAuth-only account when a fresh reauth is present', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]));
    const update = jest.fn().mockReturnValue(chain(undefined));
    const insert = jest.fn().mockReturnValue(chain(undefined));
    const service = new AccountService(makeDb({ select, update, insert }));

    await expect(
      service.setOrChangePassword(
        1,
        { newPassword: 'brand-new-password' },
        true,
      ),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('refuses to set a password on an OAuth-only account without a fresh reauth', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]));
    const update = jest.fn();
    const service = new AccountService(makeDb({ select, update }));

    await expect(
      service.setOrChangePassword(
        1,
        { newPassword: 'brand-new-password' },
        false,
      ),
    ).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]));
    const service = new AccountService(makeDb({ select }));

    await expect(
      service.setOrChangePassword(1, { newPassword: 'short' }, true),
    ).rejects.toBeInstanceOf(WeakPasswordError);
  });
});

describe('AccountService.unlinkProvider', () => {
  it('unlinks a provider when another login method remains (password)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: 'hash' }]))
      .mockReturnValueOnce(chain([{ provider: 'google' }]));
    const del = jest.fn().mockReturnValue(chain(undefined));
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ delete: del }),
    );
    const insert = jest.fn().mockReturnValue(chain(undefined));
    const service = new AccountService(makeDb({ select, transaction, insert }));

    await expect(service.unlinkProvider(1, 'google')).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('unlinks a provider when another login method remains (a second identity row)', async () => {
    // The row-count logic is provider-agnostic — it just needs >1 identity
    // row to remain. Google is the only provider the app issues today, but
    // the enum still technically allows a second value (schema.ts), so this
    // exercises the count check generically rather than assuming exactly
    // one real provider can ever exist.
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]))
      .mockReturnValueOnce(
        chain([{ provider: 'google' }, { provider: 'other' }]),
      );
    const del = jest.fn().mockReturnValue(chain(undefined));
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ delete: del }),
    );
    const insert = jest.fn().mockReturnValue(chain(undefined));
    const service = new AccountService(makeDb({ select, transaction, insert }));

    await expect(service.unlinkProvider(1, 'google')).resolves.toBeUndefined();
  });

  it('refuses to remove the final login method (no password, one provider)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: null }]))
      .mockReturnValueOnce(chain([{ provider: 'google' }]));
    const transaction = jest.fn();
    const service = new AccountService(makeDb({ select, transaction }));

    await expect(service.unlinkProvider(1, 'google')).rejects.toBeInstanceOf(
      FinalLoginMethodError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects unlinking a provider that is not actually linked', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ passwordHash: 'hash' }]))
      .mockReturnValueOnce(chain([]));
    const transaction = jest.fn();
    const service = new AccountService(makeDb({ select, transaction }));

    await expect(service.unlinkProvider(1, 'google')).rejects.toBeInstanceOf(
      NotLinkedError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
