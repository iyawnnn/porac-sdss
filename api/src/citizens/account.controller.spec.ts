import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AccountController } from './account.controller';
import {
  AccountService,
  FinalLoginMethodError,
  ReauthRequiredError,
  WrongPasswordError,
} from './account.service';
import { SessionService, type CitizenSession } from '../auth/session.service';
import type { Env } from '../config/env';

const citizen: CitizenSession = {
  citizenId: 1,
  email: 'citizen@example.com',
  citizenName: 'Citizen Name',
};

function makeConfig(): ConfigService<Env, true> {
  return { get: () => undefined } as unknown as ConfigService<Env, true>;
}

function makeRes() {
  const cookie = jest.fn();
  const res = { cookie } as unknown as Response;
  return { res, cookie };
}

function makeReq(cookies: Record<string, string> = {}): Request {
  return { cookies } as unknown as Request;
}

describe('AccountController.setPassword — session rotation', () => {
  it('rotates the citizen session cookie after a successful password change', async () => {
    const account = {
      setOrChangePassword: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountService;
    const signCitizenSession = jest.fn().mockResolvedValue('rotated-token');
    const sessions = {
      signCitizenSession,
      verifyReauth: jest.fn(),
    } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res, cookie } = makeRes();

    await controller.setPassword(
      makeReq(),
      citizen,
      { currentPassword: 'old', newPassword: 'new-password-123' },
      res,
    );

    expect(signCitizenSession).toHaveBeenCalledWith(citizen);
    expect(cookie).toHaveBeenCalledWith(
      'ac_citizen_session',
      'rotated-token',
      expect.any(Object),
    );
  });

  it('maps WrongPasswordError to 401 and does not rotate the session', async () => {
    const account = {
      setOrChangePassword: jest
        .fn()
        .mockRejectedValue(new WrongPasswordError()),
    } as unknown as AccountService;
    const signCitizenSession = jest.fn();
    const sessions = {
      signCitizenSession,
      verifyReauth: jest.fn(),
    } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.setPassword(
        makeReq(),
        citizen,
        { currentPassword: 'wrong', newPassword: 'new-password-123' },
        res,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signCitizenSession).not.toHaveBeenCalled();
  });

  it('maps ReauthRequiredError to a 428 response', async () => {
    const account = {
      setOrChangePassword: jest
        .fn()
        .mockRejectedValue(new ReauthRequiredError()),
    } as unknown as AccountService;
    const sessions = {
      signCitizenSession: jest.fn(),
      verifyReauth: jest.fn().mockResolvedValue(null),
    } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.setPassword(
        makeReq(),
        citizen,
        { newPassword: 'brand-new-password' },
        res,
      ),
    ).rejects.toMatchObject({ status: 428 });
  });
});

describe('AccountController.unlink — session rotation and error mapping', () => {
  it('rotates the citizen session cookie after a successful unlink', async () => {
    const account = {
      unlinkProvider: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountService;
    const signCitizenSession = jest.fn().mockResolvedValue('rotated-token');
    const sessions = { signCitizenSession } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res, cookie } = makeRes();

    await controller.unlink('google', citizen, res);

    expect(signCitizenSession).toHaveBeenCalledWith(citizen);
    expect(cookie).toHaveBeenCalledWith(
      'ac_citizen_session',
      'rotated-token',
      expect.any(Object),
    );
  });

  it('maps FinalLoginMethodError to a 400 and does not rotate the session', async () => {
    const account = {
      unlinkProvider: jest.fn().mockRejectedValue(new FinalLoginMethodError()),
    } as unknown as AccountService;
    const signCitizenSession = jest.fn();
    const sessions = { signCitizenSession } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.unlink('google', citizen, res),
    ).rejects.toBeInstanceOf(HttpException);
    expect(signCitizenSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider before touching the service', async () => {
    const unlinkProvider = jest.fn();
    const account = { unlinkProvider } as unknown as AccountService;
    const sessions = {
      signCitizenSession: jest.fn(),
    } as unknown as SessionService;
    const controller = new AccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.unlink('twitter', citizen, res),
    ).rejects.toBeInstanceOf(HttpException);
    expect(unlinkProvider).not.toHaveBeenCalled();
  });
});
