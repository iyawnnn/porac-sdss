import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { IdentityConflictError, OAuthService } from './oauth.service';
import { SessionService } from '../session.service';
import type { OAuthProfile } from './oauth-profile';

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.innerJoin = self;
  obj.values = self;
  obj.returning = self;
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeSessions(): SessionService {
  return {
    signCitizenSession: jest.fn().mockResolvedValue('signed-token'),
  } as unknown as SessionService;
}

const googleProfile: OAuthProfile = {
  subject: 'google-sub-1',
  email: 'citizen@example.com',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
};

describe('OAuthService.linkIdentity', () => {
  it('links a brand-new Google identity to the authenticated citizen', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([])) // no existing identity for this subject
      .mockReturnValueOnce(chain([])); // citizen has no identity for this provider yet
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ insert }),
    );
    const db = { select, insert, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.linkIdentity(1, 'google', googleProfile),
    ).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('never looks up by email when linking — same-email accounts are not silently merged', async () => {
    // Regression guard: the public login flow (loginOrCreate) matches by
    // email and requires explicit linking on conflict; the authenticated
    // link flow must NOT do that at all — it only ever queries by
    // (provider, subject) and (citizenId, provider), never citizens.email.
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ insert }),
    );
    const db = { select, insert, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    // Even though this profile's email matches an existing citizen (in a
    // real DB), linkIdentity for a *different, already-known* citizenId
    // must succeed purely on provider+subject grounds — no email query is
    // ever issued (only 2 select calls: subject lookup, provider lookup).
    await service.linkIdentity(1, 'google', googleProfile);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when the citizen re-links the same provider account', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          email: 'citizen@example.com',
          firstName: 'Juan',
          lastName: 'Dela Cruz',
        },
      ]),
    );
    const transaction = jest.fn();
    const db = { select, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.linkIdentity(1, 'google', googleProfile),
    ).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects linking a provider identity already linked to another citizen', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 999,
          email: 'other@example.com',
          firstName: 'Other',
          lastName: 'Person',
        },
      ]),
    );
    // Conflict rejection still writes an audit event (via db.insert), just
    // never touches citizen_identities (via db.transaction).
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn();
    const db = { select, insert, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.linkIdentity(1, 'google', googleProfile),
    ).rejects.toBeInstanceOf(IdentityConflictError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects linking a second identity for a provider the citizen already has linked', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([])) // subject not linked to anyone
      .mockReturnValueOnce(chain([{ id: 5 }])); // but citizen already has *a* google identity
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn();
    const db = { select, insert, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.linkIdentity(1, 'google', googleProfile),
    ).rejects.toBeInstanceOf(IdentityConflictError);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('OAuthService.verifyProviderControl', () => {
  it('returns true when the resolved subject matches the linked identity', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ providerSubject: 'google-sub-1' }]));
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.verifyProviderControl(1, 'google', googleProfile),
    ).resolves.toBe(true);
  });

  it('returns false when no identity is linked for that provider', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([]));
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.verifyProviderControl(1, 'google', googleProfile),
    ).resolves.toBe(false);
  });

  it('returns false when the resolved subject does not match the linked identity', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([{ providerSubject: 'a-different-subject' }]));
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions());

    await expect(
      service.verifyProviderControl(1, 'google', googleProfile),
    ).resolves.toBe(false);
  });
});
