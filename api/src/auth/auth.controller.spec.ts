import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { SESSION_COOKIE, CITIZEN_SESSION_COOKIE } from './session.service';
import type { AuthService } from './auth.service';
import type { SessionService, AdminSession, CitizenSession } from './session.service';
import type { Env } from '../config/env';

function makeController(sessions: Partial<SessionService>) {
  const auth = {} as AuthService;
  const config = {} as ConfigService<Env, true>;
  return new AuthController(auth, sessions as SessionService, config);
}

function fakeRes(): Response & { cookie: jest.Mock } {
  return { cookie: jest.fn() } as unknown as Response & { cookie: jest.Mock };
}

const adminSession: AdminSession = {
  adminId: 1,
  email: 'admin@example.com',
  adminName: 'Admin',
  office: 'MEO',
  role: 'officer',
};

const citizenSession: CitizenSession = {
  citizenId: 1,
  email: 'citizen@example.com',
  citizenName: 'Citizen',
};

describe('AuthController logout (server-side session invalidation)', () => {
  it('adminLogout invalidates the session when the cookie is valid, and clears the cookie', async () => {
    const verifyAdminSession = jest.fn().mockResolvedValue(adminSession);
    const invalidateAdminSession = jest.fn().mockResolvedValue(undefined);
    const controller = makeController({ verifyAdminSession, invalidateAdminSession });
    const req = { cookies: { [SESSION_COOKIE]: 'a-token' } } as unknown as Request;
    const res = fakeRes();

    const result = await controller.adminLogout(req, res);

    expect(verifyAdminSession).toHaveBeenCalledWith('a-token');
    expect(invalidateAdminSession).toHaveBeenCalledWith(adminSession.adminId);
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    expect(result).toEqual({ ok: true });
  });

  it('adminLogout still succeeds and clears the cookie when there is no/invalid session (never throws)', async () => {
    const verifyAdminSession = jest.fn().mockResolvedValue(null);
    const invalidateAdminSession = jest.fn();
    const controller = makeController({ verifyAdminSession, invalidateAdminSession });
    const req = { cookies: {} } as unknown as Request;
    const res = fakeRes();

    const result = await controller.adminLogout(req, res);

    expect(invalidateAdminSession).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    expect(result).toEqual({ ok: true });
  });

  it('citizenLogout invalidates the session when the cookie is valid, and clears the cookie', async () => {
    const verifyCitizenSession = jest.fn().mockResolvedValue(citizenSession);
    const invalidateCitizenSession = jest.fn().mockResolvedValue(undefined);
    const controller = makeController({ verifyCitizenSession, invalidateCitizenSession });
    const req = { cookies: { [CITIZEN_SESSION_COOKIE]: 'a-token' } } as unknown as Request;
    const res = fakeRes();

    const result = await controller.citizenLogout(req, res);

    expect(verifyCitizenSession).toHaveBeenCalledWith('a-token');
    expect(invalidateCitizenSession).toHaveBeenCalledWith(citizenSession.citizenId);
    expect(res.cookie).toHaveBeenCalledWith(CITIZEN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    expect(result).toEqual({ ok: true });
  });

  it('citizenLogout still succeeds and clears the cookie when there is no/invalid session (never throws)', async () => {
    const verifyCitizenSession = jest.fn().mockResolvedValue(null);
    const invalidateCitizenSession = jest.fn();
    const controller = makeController({ verifyCitizenSession, invalidateCitizenSession });
    const req = { cookies: {} } as unknown as Request;
    const res = fakeRes();

    const result = await controller.citizenLogout(req, res);

    expect(invalidateCitizenSession).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(CITIZEN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    expect(result).toEqual({ ok: true });
  });
});
