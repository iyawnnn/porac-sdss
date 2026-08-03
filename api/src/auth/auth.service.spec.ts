import bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { SessionService } from './session.service';

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
        },
      ]),
    );
    const db = { select } as unknown as PostgresJsDatabase;
    const service = new AuthService(db, makeSessions());

    const { token, office } = await service.adminLogin(
      'admin@example.com',
      'correct-horse',
    );
    expect(token).toBe('admin-token');
    expect(office).toBe('MEO');
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
    const service = new AuthService(db, makeSessions());

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
    const service = new AuthService(db, makeSessions());

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
    const service = new AuthService(db, makeSessions());

    const { token } = await service.citizenSignup(
      'new@example.com',
      'longenoughpassword',
      'New',
      'Citizen',
    );
    expect(token).toBe('citizen-token');
  });
});
