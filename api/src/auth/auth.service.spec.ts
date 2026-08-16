import bcrypt from 'bcryptjs';
import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { SessionService } from './session.service';
import { RateLimitService } from '../domain/ratelimit.service';
import type { AdminAuditService } from '../admin/admin-audit.service';

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
    checkCitizenLoginRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    recordCitizenLoginFailure: jest.fn().mockResolvedValue(undefined),
    resetCitizenLoginFailures: jest.fn().mockResolvedValue(undefined),
    checkCitizenSignupRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    recordCitizenSignupAttempt: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RateLimitService;
}

function makeAdminAudit(
  overrides: Partial<AdminAuditService> = {},
): AdminAuditService {
  return {
    logBestEffort: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AdminAuditService;
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
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

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
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

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
    const rateLimit = makeRateLimit();
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    const { token } = await service.citizenLogin(
      'citizen@example.com',
      'hunter22',
    );
    expect(token).toBe('citizen-token');
    expect(rateLimit.resetCitizenLoginFailures).toHaveBeenCalledWith(
      'citizen@example.com',
    );
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
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      makeAdminAudit(),
    );

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
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      makeAdminAudit(),
    );

    const { token } = await service.citizenSignup(
      'new@example.com',
      'longenoughpassword',
      'New',
      'Citizen',
      '1.2.3.4',
    );
    expect(token).toBe('citizen-token');
  });
});

describe('AuthService.citizenLogin — failed-login throttling (hardening item 3)', () => {
  it('rejects a throttled request before ever querying the citizens table or running bcrypt', async () => {
    const select = jest.fn();
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit({
      checkCitizenLoginRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Too many failed login attempts.',
      }),
    });
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    await expect(
      service.citizenLogin('citizen@example.com', 'anything'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(select).not.toHaveBeenCalled();
    expect(rateLimit.recordCitizenLoginFailure).not.toHaveBeenCalled();
  });

  it('throws a 429 when throttled, distinct from the normal 401 wrong-password response', async () => {
    const rateLimit = makeRateLimit({
      checkCitizenLoginRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Too many failed login attempts.',
      }),
    });
    const db = { select: jest.fn() } as unknown as PostgresJsDatabase;
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    let status: number | undefined;
    try {
      await service.citizenLogin('citizen@example.com', 'anything');
    } catch (err) {
      status = (err as HttpException).getStatus();
    }
    expect(status).toBe(429);
  });

  it('records a failure for a nonexistent citizen and for an existing citizen with a wrong password identically (enumeration-safe)', async () => {
    const nonexistentDb = {
      select: jest.fn().mockReturnValueOnce(chain([])),
    } as unknown as PostgresJsDatabase;
    const nonexistentRateLimit = makeRateLimit();
    await expect(
      new AuthService(
        nonexistentDb,
        makeSessions(),
        nonexistentRateLimit,
        makeAdminAudit(),
      ).citizenLogin('nobody@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(nonexistentRateLimit.recordCitizenLoginFailure).toHaveBeenCalledWith(
      'nobody@example.com',
    );

    const passwordHash = await bcrypt.hash('correct-horse', 10);
    const existingDb = {
      select: jest.fn().mockReturnValueOnce(
        chain([
          {
            id: 5,
            email: 'citizen@example.com',
            passwordHash,
            firstName: 'Cit',
            lastName: 'Izen',
          },
        ]),
      ),
    } as unknown as PostgresJsDatabase;
    const existingRateLimit = makeRateLimit();
    await expect(
      new AuthService(
        existingDb,
        makeSessions(),
        existingRateLimit,
        makeAdminAudit(),
      ).citizenLogin('citizen@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(existingRateLimit.recordCitizenLoginFailure).toHaveBeenCalledWith(
      'citizen@example.com',
    );
  });

  it('checks and records against the normalized email, not whatever casing/whitespace was submitted', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([])); // no such citizen
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit();
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    await expect(
      service.citizenLogin('  Citizen@Example.com  ', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rateLimit.checkCitizenLoginRateLimit).toHaveBeenCalledWith(
      'citizen@example.com',
    );
    expect(rateLimit.recordCitizenLoginFailure).toHaveBeenCalledWith(
      'citizen@example.com',
    );
  });
});

describe('AuthService.citizenSignup — account-creation-spam throttling (hardening item 3)', () => {
  it('rejects a throttled request before ever querying the citizens table', async () => {
    const select = jest.fn();
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit({
      checkCitizenSignupRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Too many accounts created from this network. Try again later.',
      }),
    });
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    await expect(
      service.citizenSignup(
        'new@example.com',
        'longenoughpassword',
        'New',
        'Citizen',
        '1.2.3.4',
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(select).not.toHaveBeenCalled();
    expect(rateLimit.recordCitizenSignupAttempt).not.toHaveBeenCalled();
  });

  it('throws a 429 when the IP signup limit is hit', async () => {
    const rateLimit = makeRateLimit({
      checkCitizenSignupRateLimit: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Too many accounts created from this network. Try again later.',
      }),
    });
    const db = { select: jest.fn() } as unknown as PostgresJsDatabase;
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    let status: number | undefined;
    try {
      await service.citizenSignup(
        'new@example.com',
        'longenoughpassword',
        'New',
        'Citizen',
        '1.2.3.4',
      );
    } catch (err) {
      status = (err as HttpException).getStatus();
    }
    expect(status).toBe(429);
  });

  it('records an attempt under the limit, and still enforces the existing duplicate-email conflict unchanged', async () => {
    const select = jest.fn().mockReturnValueOnce(
      chain([{ id: 9, email: 'existing@example.com' }]),
    ); // existing account
    const db = { select } as unknown as PostgresJsDatabase;
    const rateLimit = makeRateLimit();
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

    await expect(
      service.citizenSignup(
        'existing@example.com',
        'longenoughpassword',
        'New',
        'Citizen',
        '1.2.3.4',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rateLimit.checkCitizenSignupRateLimit).toHaveBeenCalledWith(
      '1.2.3.4',
    );
    expect(rateLimit.recordCitizenSignupAttempt).toHaveBeenCalledWith(
      '1.2.3.4',
    );
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
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

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
      makeAdminAudit(),
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
      makeAdminAudit(),
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
    const service = new AuthService(
      db,
      makeSessions(),
      rateLimit,
      makeAdminAudit(),
    );

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

describe('AuthService.adminLogin — login audit events (R4)', () => {
  it('writes admin_login_failed for a wrong password against an existing admin', async () => {
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
    const adminAudit = makeAdminAudit();
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      adminAudit,
    );

    await expect(
      service.adminLogin('admin@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminAudit.logBestEffort).toHaveBeenCalledTimes(1);
    const [input] = (adminAudit.logBestEffort as jest.Mock).mock.calls[0];
    expect(input.actionType).toBe('admin_login_failed');
    expect(input.targetType).toBe('admin');
    expect(input.targetId).toBe(1);
    expect(input.actor.adminId).toBe(1);
  });

  it('writes admin_login for a successful login', async () => {
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
    const adminAudit = makeAdminAudit();
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      adminAudit,
    );

    await service.adminLogin('admin@example.com', 'correct-horse');

    expect(adminAudit.logBestEffort).toHaveBeenCalledTimes(1);
    const [input] = (adminAudit.logBestEffort as jest.Mock).mock.calls[0];
    expect(input.actionType).toBe('admin_login');
    expect(input.targetType).toBe('admin');
    expect(input.targetId).toBe(1);
  });

  it('never includes the password, any part of it, or its length in the stored audit input', async () => {
    const password = 'correct-horse-battery-staple';
    const passwordHash = await bcrypt.hash(password, 10);
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
    const adminAudit = makeAdminAudit();
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      adminAudit,
    );

    await service.adminLogin('admin@example.com', password);

    const [input] = (adminAudit.logBestEffort as jest.Mock).mock.calls[0];
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(passwordHash);
    expect(serialized).not.toMatch(/length/i);
  });

  it('does not write any audit event for a nonexistent email — no admin row to attribute an actor to', async () => {
    const select = jest.fn().mockReturnValueOnce(chain([])); // no such admin
    const db = { select } as unknown as PostgresJsDatabase;
    const adminAudit = makeAdminAudit();
    const service = new AuthService(
      db,
      makeSessions(),
      makeRateLimit(),
      adminAudit,
    );

    await expect(
      service.adminLogin('nobody@example.com', 'whatever'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminAudit.logBestEffort).not.toHaveBeenCalled();
  });
});
