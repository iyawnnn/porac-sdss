import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AdminAccountController } from './admin-account.controller';
import {
  AdminAccountService,
  WeakPasswordError,
  WrongPasswordError,
} from './admin-account.service';
import { SessionService, type AdminSession } from '../auth/session.service';
import type { Env } from '../config/env';

const actor: AdminSession = {
  adminId: 1,
  email: 'officer@example.com',
  adminName: 'Officer One',
  office: 'MEO',
  role: 'officer',
};

function makeConfig(): ConfigService<Env, true> {
  return { get: () => undefined } as unknown as ConfigService<Env, true>;
}

function makeRes() {
  const cookie = jest.fn();
  const res = { cookie } as unknown as Response;
  return { res, cookie };
}

describe('AdminAccountController.changePassword — session rotation', () => {
  it('rotates the admin session cookie after a successful password change', async () => {
    const account = {
      changeOwnPassword: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminAccountService;
    const signAdminSession = jest.fn().mockResolvedValue('rotated-token');
    const sessions = { signAdminSession } as unknown as SessionService;
    const controller = new AdminAccountController(account, sessions, makeConfig());
    const { res, cookie } = makeRes();

    await controller.changePassword(
      actor,
      { currentPassword: 'old', newPassword: 'new-password-123' },
      res,
    );

    expect(signAdminSession).toHaveBeenCalledWith(actor);
    expect(cookie).toHaveBeenCalledWith(
      'ac_admin_session',
      'rotated-token',
      expect.any(Object),
    );
  });

  it('maps WrongPasswordError to 401 and does not rotate the session', async () => {
    const account = {
      changeOwnPassword: jest.fn().mockRejectedValue(new WrongPasswordError()),
    } as unknown as AdminAccountService;
    const signAdminSession = jest.fn();
    const sessions = { signAdminSession } as unknown as SessionService;
    const controller = new AdminAccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.changePassword(actor, { currentPassword: 'wrong', newPassword: 'new-password-123' }, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAdminSession).not.toHaveBeenCalled();
  });

  it('maps WeakPasswordError to 400 and does not rotate the session', async () => {
    const account = {
      changeOwnPassword: jest.fn().mockRejectedValue(new WeakPasswordError()),
    } as unknown as AdminAccountService;
    const signAdminSession = jest.fn();
    const sessions = { signAdminSession } as unknown as SessionService;
    const controller = new AdminAccountController(account, sessions, makeConfig());
    const { res } = makeRes();

    await expect(
      controller.changePassword(actor, { currentPassword: 'old', newPassword: 'short' }, res),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(signAdminSession).not.toHaveBeenCalled();
  });
});
