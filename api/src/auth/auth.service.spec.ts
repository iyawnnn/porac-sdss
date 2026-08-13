import bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { SessionService } from './session.service';
import { RateLimitService } from '../domain/ratelimit.service';

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.values = self;
  obj.returning = () => Promise.resolve(result);
  obj.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

function makeSessions(): SessionService {
  return {
    signAdminSession: jest.fn().mockResolvedValue('admin-token'),
    signCitizenSession: jest.fn().mockResolvedValue('citizen-token'),
  } as unknown as SessionService;
}

// Defaults to "not throttled" so every test unrelated to the throttle itself
// behaves exactly as before it existed.
function makeRateLimit(
  overrides: Partial<RateLimitService> = {},
): RateLimitService {
  return {
    checkAdminLoginRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    recordAdminLoginFailure: jest.fn().mockResolvedValue(undefined),
    resetAdminLoginFailures: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RateLimitService;
}

describe('AuthService — existing password flows stay intact', () => {
  it('logs an admin in with a matching password (admin auth is untouched by OAuth work)', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 10);
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          email: 'admin@example.com',
          passwordHash,
          firstName: 'Ad',
          lastName: 'Min',
          office: 'MEO',
          role: 'officer',
          isActive: true,
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit();
    const service = new AuthService(db, makeSessions(), rateLimit);

    const { token, office } = await service.adminLogin(
      'admin@example.com',
      'correct-horse',
    );
    expect(token).toBe('admin-token');
    expect(office).toBe('MEO');
    // A successful login clears any prior failures — this is what makes the
    // throttle self-clearing rather than a de-facto permanent lock.
    expect(rateLimit.resetAdminLoginFailures).toHaveBeenCalledWith(
      'admin@example.com',
    );
    expect(rateLimit.recordAdminLoginFailure).not.toHaveBeenCalled();
  });

  it('rejects login for a deactivated admin even with the correct password, and records it as a failure', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 10);
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 1,
          email: 'admin@example.com',
          passwordHash,
          firstName: 'Ad',
          lastName: 'Min',
          office: 'MEO',
          role: 'officer',
          isActive: false,
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit();
    const service = new AuthService(db, makeSessions(), rateLimit);

    await expect(
      service.adminLogin('admin@example.com', 'correct-horse'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Deactivated is recorded exactly like a wrong password — a distinct
    // code path here would let a login attempt probe deactivation status.
    expect(rateLimit.recordAdminLoginFailure).toHaveBeenCalledWith(
      'admin@example.com',
    );
  });

  it('logs a citizen in with a matching password', async () => {
    const passwordHash = await bcrypt.hash('hunter22', 10);
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 2,
          email: 'citizen@example.com',
          passwordHash,
          firstName: 'Cit',
          lastName: 'Izen',
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new AuthService(db, makeSessions(), makeRateLimit());

    const { token } = await service.citizenLogin(
      'citizen@example.com',
      'hunter22',
    );
    expect(token).toBe('citizen-token');
  });

  it('rejects a citizen login attempt for an OAuth-only account (null password_hash) without crashing', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([
        {
          id: 3,
          email: 'oauth-only@example.com',
          passwordHash: null,
          firstName: 'O',
          lastName: 'Auth',
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new AuthService(db, makeSessions(), makeRateLimit());

    await expect(
      service.citizenLogin('oauth-only@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signs a new citizen up with a hashed password', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([])); // no existing account
    const insert = jest.fn().mockReturnValue({
      values: () => ({
        returning: () =>
          Promise.resolve([
            {
              id: 4,
              email: 'new@example.com',
              firstName: 'New',
              lastName: 'Citizen',
            },
          ]),
      }),
    });
    const db = { select, insert } as unknown as PostgresJsDatabase;
    const service = new AuthService(db, makeSessions(), makeRateLimit());

    const { token } = await service.citizenSignup(
      'new@example.com',
      'longenoughpassword',
      'New',
      'Citizen',
    );
    expect(token).toBe('citizen-token');
  });
});

describe('AuthService.adminLogin — failed-login throttling (R1)', () => {
  it('rejects a throttled request before ever querying the admins table or running bcrypt', async () => {
    const select = jest.fn();
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit({
      checkAdminLoginRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Too many failed login attempts.',
      }),
    });
    const service = new AuthService(db, makeSessions(), rateLimit);

    await expect(
      service.adminLogin('meo@porac.gov.ph', 'anything'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(select).not.toHaveBeenCalled();
    // Being throttled never records a further failure of its own — that's
    // what keeps the cooldown bounded rather than indefinitely extendable.
    expect(rateLimit.recordAdminLoginFailure).not.toHaveBeenCalled();
  });

  it('throws the exact same message whether the request is throttled or just a normal wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 10);
    const admin = {
      id: 1,
      email: 'meo@porac.gov.ph',
      passwordHash,
      firstName: 'M',
      lastName: 'EO',
      office: 'MEO',
      role: 'officer',
      isActive: true,
    };

    const normalDb = {
      select: jest.fn().mockReturnValueOnce(chain([admin])),
    } as unknown as PostgresJsDatabase;
    const normalService = new AuthService(
      normalDb,
      makeSessions(),
      makeRateLimit(),
    );

    const throttledDb = { select: jest.fn() } as unknown as PostgresJsDatabase;
    const throttledService = new AuthService(
      throttledDb,
      makeSessions(),
      makeRateLimit({
        checkAdminLoginRateLimit: jest
          .fn()
          .mockResolvedValue({ allowed: false }),
      }),
    );

    let normalMessage = '';
    let throttledMessage = '';
    try {
      await normalService.adminLogin('meo@porac.gov.ph', 'wrong-password');
    } catch (err) {
      normalMessage = (err as UnauthorizedException).message;
    }
    try {
      await throttledService.adminLogin('meo@porac.gov.ph', 'wrong-password');
    } catch (err) {
      throttledMessage = (err as UnauthorizedException).message;
    }

    expect(normalMessage).toBe('Invalid email or password');
    expect(throttledMessage).toBe(normalMessage);
  });

  it('checks and records against the normalized email, not whatever casing/whitespace was submitted', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([])); // no such admin
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit();
    const service = new AuthService(db, makeSessions(), rateLimit);

    await expect(
      service.adminLogin('  MEO@Porac.gov.ph  ', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rateLimit.checkAdminLoginRateLimit).toHaveBeenCalledWith(
      'meo@porac.gov.ph',
    );
    expect(rateLimit.recordAdminLoginFailure).toHaveBeenCalledWith(
      'meo@porac.gov.ph',
    );
  });
});
