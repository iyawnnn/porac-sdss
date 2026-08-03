import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  PasswordResetRateLimitedError,
  PasswordResetService,
  TokenExpiredError,
  TokenNotFoundError,
  TokenUsedError,
  WeakPasswordError,
} from './password-reset.service';
import type { RateLimitService } from '../domain/ratelimit.service';
import type { EmailService } from './email.service';
import type { Env } from '../config/env';

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.innerJoin = self;
  obj.values = self;
  obj.set = self;
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeConfig(): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    RESET_TOKEN_TTL_MINUTES: 30,
    WEB_ORIGIN: 'http://localhost:3000',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

function makeRateLimit(overrides?: {
  checkPasswordResetRateLimit?: jest.Mock;
  recordPasswordResetAttempt?: jest.Mock;
}): RateLimitService {
  return {
    checkPasswordResetRateLimit:
      overrides?.checkPasswordResetRateLimit ??
      jest.fn().mockResolvedValue({ allowed: true }),
    recordPasswordResetAttempt:
      overrides?.recordPasswordResetAttempt ??
      jest.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
}

function makeEmail(overrides?: Partial<Record<keyof EmailService, jest.Mock>>) {
  const sendPasswordReset =
    overrides?.sendPasswordReset ?? jest.fn().mockResolvedValue(undefined);
  const sendOAuthOnlyNotice =
    overrides?.sendOAuthOnlyNotice ?? jest.fn().mockResolvedValue(undefined);
  const sendPasswordResetConfirmation =
    overrides?.sendPasswordResetConfirmation ??
    jest.fn().mockResolvedValue(undefined);
  const email = {
    sendPasswordReset,
    sendOAuthOnlyNotice,
    sendPasswordResetConfirmation,
  } as unknown as EmailService;
  return {
    email,
    sendPasswordReset,
    sendOAuthOnlyNotice,
    sendPasswordResetConfirmation,
  };
}

describe('PasswordResetService.requestReset', () => {
  it('sends a reset email for an existing password account and stores a hashed token', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        chain([{ id: 1, email: 'citizen@example.com', passwordHash: 'hash' }]),
      );
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordReset, sendOAuthOnlyNotice } = makeEmail();
    const rateLimit = makeRateLimit();
    const service = new PasswordResetService(
      db,
      rateLimit,
      email,
      makeConfig(),
    );

    await service.requestReset('Citizen@Example.com', '1.2.3.4');

    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(sendOAuthOnlyNotice).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const [, resetUrl] = sendPasswordReset.mock.calls[0] as [string, string];
    expect(resetUrl).toMatch(
      /^http:\/\/localhost:3000\/reset-password\?token=/,
    );
  });

  it('generates a token with at least 48 bytes of entropy', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        chain([{ id: 1, email: 'citizen@example.com', passwordHash: 'hash' }]),
      );
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordReset } = makeEmail();
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await service.requestReset('citizen@example.com', '1.2.3.4');

    const [, resetUrl] = sendPasswordReset.mock.calls[0] as [string, string];
    const token = new URL(resetUrl).searchParams.get('token') as string;
    const decoded = Buffer.from(token, 'base64url');
    expect(decoded.length).toBe(48);
  });

  it('sends an OAuth-only notice (not a reset link) for a password-less account', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        chain([{ id: 2, email: 'oauth@example.com', passwordHash: null }]),
      );
    const insert = jest.fn();
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordReset, sendOAuthOnlyNotice } = makeEmail();
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await service.requestReset('oauth@example.com', '1.2.3.4');

    expect(sendOAuthOnlyNotice).toHaveBeenCalledWith('oauth@example.com');
    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does nothing (but does not throw) for an email with no account — enumeration resistance', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([]));
    const insert = jest.fn();
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordReset, sendOAuthOnlyNotice } = makeEmail();
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await expect(
      service.requestReset('nobody@example.com', '1.2.3.4'),
    ).resolves.toBeUndefined();
    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(sendOAuthOnlyNotice).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('records an attempt (for rate-limit counting) even when no account exists', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([]));
    const recordPasswordResetAttempt = jest.fn().mockResolvedValue(undefined);
    const db = { select, insert: jest.fn() } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit({ recordPasswordResetAttempt }),
      makeEmail().email,
      makeConfig(),
    );

    await service.requestReset('nobody@example.com', '1.2.3.4');
    expect(recordPasswordResetAttempt).toHaveBeenCalledWith(
      '1.2.3.4',
      'nobody@example.com',
    );
  });

  it('rejects when the rate limit is exceeded and never touches the database', async () => {
    const select = jest.fn();
    const db = { select, insert: jest.fn() } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit({
      checkPasswordResetRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: false, reason: 'Too many requests.' }),
    });
    const service = new PasswordResetService(
      db,
      rateLimit,
      makeEmail().email,
      makeConfig(),
    );

    await expect(
      service.requestReset('citizen@example.com', '1.2.3.4'),
    ).rejects.toBeInstanceOf(PasswordResetRateLimitedError);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('PasswordResetService.validateToken', () => {
  it('returns true for a valid, unused, unexpired token', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(service.validateToken('some-token')).resolves.toBe(true);
  });

  it('returns false for an unknown token', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([]));
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(service.validateToken('bogus')).resolves.toBe(false);
  });

  it('returns false for an expired token', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(service.validateToken('expired')).resolves.toBe(false);
  });

  it('returns false for an already-used token', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(service.validateToken('used')).resolves.toBe(false);
  });
});

describe('PasswordResetService.resetPassword', () => {
  it('updates the password, bumps session_valid_after, marks the token used, and audits — on success', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const update = jest.fn().mockReturnValue(chain(undefined));
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ update }),
    );
    const db = { select, transaction, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordResetConfirmation } = makeEmail();
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('valid-token', 'brand-new-password'),
    ).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2); // citizens + password_reset_tokens
    expect(insert).toHaveBeenCalledTimes(1); // audit event
    expect(sendPasswordResetConfirmation).toHaveBeenCalledWith(
      'citizen@example.com',
    );
  });

  it('still succeeds even if the confirmation email fails to send', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const update = jest.fn().mockReturnValue(chain(undefined));
    const insert = jest
      .fn()
      .mockReturnValue({ values: () => Promise.resolve(undefined) });
    const transaction = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ update }),
    );
    const db = { select, transaction, insert } as unknown as PostgresJsDatabase;
    const { email } = makeEmail({
      sendPasswordResetConfirmation: jest
        .fn()
        .mockRejectedValue(new Error('smtp down')),
    });
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('valid-token', 'brand-new-password'),
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown token', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([]));
    const db = {
      select,
      transaction: jest.fn(),
    } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('bogus', 'brand-new-password'),
    ).rejects.toBeInstanceOf(TokenNotFoundError);
  });

  it('rejects an expired token', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const db = {
      select,
      transaction: jest.fn(),
    } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('expired', 'brand-new-password'),
    ).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('rejects an already-used token', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          citizenId: 1,
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          email: 'citizen@example.com',
        },
      ]),
    );
    const db = {
      select,
      transaction: jest.fn(),
    } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('used', 'brand-new-password'),
    ).rejects.toBeInstanceOf(TokenUsedError);
  });

  it('rejects a weak new password before even looking up the token', async () => {
    const select = jest.fn();
    const db = {
      select,
      transaction: jest.fn(),
    } as unknown as PostgresJsDatabase;
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      makeEmail().email,
      makeConfig(),
    );

    await expect(
      service.resetPassword('any-token', 'short'),
    ).rejects.toBeInstanceOf(WeakPasswordError);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('token hashing', () => {
  it('only ever stores a SHA-256 hash of the token, never the raw value', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        chain([{ id: 1, email: 'citizen@example.com', passwordHash: 'hash' }]),
      );
    let insertedHash = '';
    const insert = jest.fn().mockReturnValue({
      values: (v: { tokenHash: string }) => {
        insertedHash = v.tokenHash;
        return Promise.resolve(undefined);
      },
    });
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const { email, sendPasswordReset } = makeEmail();
    const service = new PasswordResetService(
      db,
      makeRateLimit(),
      email,
      makeConfig(),
    );

    await service.requestReset('citizen@example.com', '1.2.3.4');

    const [, resetUrl] = sendPasswordReset.mock.calls[0] as [string, string];
    const token = new URL(resetUrl).searchParams.get('token') as string;
    expect(insertedHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(insertedHash).not.toBe(token);
  });
});
