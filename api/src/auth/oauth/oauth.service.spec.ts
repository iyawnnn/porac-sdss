import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  AccountLinkRequiredError,
  EmailRequiredError,
  OAuthService,
} from './oauth.service';
import { SessionService } from '../session.service';
import type { OAuthProfile } from './oauth-profile';

// Mimics drizzle's fluent query builder just enough for OAuthService's call
// shapes (select().from()[.innerJoin()].where() and transaction()) — this
// repo has no DB test harness (no testcontainers/pg-mem, confirmed in
// reports.service.spec.ts), so unit tests stub the chain rather than hit a
// real database.
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

function makeSessions(): {
  sessions: SessionService;
  signCitizenSession: jest.Mock;
} {
  const signCitizenSession = jest.fn().mockResolvedValue('signed-token');
  return {
    sessions: { signCitizenSession } as unknown as SessionService,
    signCitizenSession,
  };
}

const googleProfile: OAuthProfile = {
  subject: 'google-sub-1',
  email: 'citizen@example.com',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
};

describe('OAuthService.loginOrCreate', () => {
  it('signs in when an identity for this provider+subject already exists', async () => {
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
    const { sessions, signCitizenSession } = makeSessions();
    const service = new OAuthService(db, sessions);

    const { token } = await service.loginOrCreate('google', googleProfile);

    expect(token).toBe('signed-token');
    expect(transaction).not.toHaveBeenCalled();
    expect(signCitizenSession).toHaveBeenCalledWith({
      citizenId: 1,
      email: 'citizen@example.com',
      citizenName: 'Juan Dela Cruz',
    });
  });

  it('signs in an existing Facebook identity the same way', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 2,
          email: 'fb@example.com',
          firstName: 'Maria',
          lastName: 'Santos',
        },
      ]),
    );
    const db = {
      select,
      transaction: jest.fn(),
    } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions().sessions);

    const { token } = await service.loginOrCreate('facebook', {
      subject: 'fb-sub-1',
      email: 'fb@example.com',
      firstName: 'Maria',
      lastName: 'Santos',
    });

    expect(token).toBe('signed-token');
  });

  it('creates a new citizen + identity atomically when the email is unused', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([])) // no existing identity
      .mockReturnValueOnce(chain([])); // no existing citizen with this email
    let insertCallCount = 0;
    const tx = {
      insert: (): { values: (v?: unknown) => unknown } => {
        insertCallCount += 1;
        if (insertCallCount === 1) {
          return {
            values: () => ({
              returning: () =>
                Promise.resolve([
                  {
                    id: 5,
                    email: 'citizen@example.com',
                    firstName: 'Juan',
                    lastName: 'Dela Cruz',
                  },
                ]),
            }),
          };
        }
        return { values: () => Promise.resolve(undefined) };
      },
    };
    const transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
    const db = { select, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions().sessions);

    const { token } = await service.loginOrCreate('google', googleProfile);

    expect(token).toBe('signed-token');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('never creates a second identity/citizen for an already-linked provider subject', async () => {
    // Regression guard for "duplicate provider subject": once findByIdentity
    // matches, loginOrCreate must short-circuit to sign-in and never reach
    // the create path — the DB's unique (provider, provider_subject) index
    // is defense-in-depth, not the only guard.
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
    const service = new OAuthService(db, makeSessions().sessions);

    await service.loginOrCreate('google', googleProfile);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires explicit linking when the normalized email matches an existing account', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(chain([])) // no existing identity for this provider
      .mockReturnValueOnce(
        chain([{ id: 9, email: 'citizen@example.com', passwordHash: 'hash' }]),
      ); // existing password account with the same email
    const transaction = jest.fn();
    const db = { select, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions().sessions);

    await expect(
      service.loginOrCreate('google', googleProfile),
    ).rejects.toBeInstanceOf(AccountLinkRequiredError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects when the provider does not supply a usable email', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([])); // no existing identity
    const transaction = jest.fn();
    const db = { select, transaction } as unknown as PostgresJsDatabase;
    const service = new OAuthService(db, makeSessions().sessions);

    await expect(
      service.loginOrCreate('facebook', {
        subject: 'fb-sub-2',
        email: null,
        firstName: 'No',
        lastName: 'Email',
      }),
    ).rejects.toBeInstanceOf(EmailRequiredError);
    expect(transaction).not.toHaveBeenCalled();
  });
});
