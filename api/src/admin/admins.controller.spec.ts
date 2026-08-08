import { BadRequestException } from '@nestjs/common';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import {
  AdminAccountService,
  SelfResetNotAllowedError,
  WeakPasswordError,
} from './admin-account.service';
import type { AdminSession } from '../auth/session.service';

const SYSTEM_ADMIN: AdminSession = {
  adminId: 3,
  email: 'sysadmin@example.com',
  adminName: 'Sys Admin',
  office: null,
  role: 'system_admin',
};

describe('AdminsController.resetPassword — error mapping', () => {
  it('maps SelfResetNotAllowedError to a 400', async () => {
    const account = {
      resetPassword: jest.fn().mockRejectedValue(new SelfResetNotAllowedError()),
    } as unknown as AdminAccountService;
    const controller = new AdminsController({} as AdminsService, account);

    await expect(
      controller.resetPassword(3, SYSTEM_ADMIN, 'longenoughpassword'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps WeakPasswordError to a 400', async () => {
    const account = {
      resetPassword: jest.fn().mockRejectedValue(new WeakPasswordError()),
    } as unknown as AdminAccountService;
    const controller = new AdminsController({} as AdminsService, account);

    await expect(
      controller.resetPassword(42, SYSTEM_ADMIN, 'short'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns ok on success and forwards the actor/target/password', async () => {
    const resetPassword = jest.fn().mockResolvedValue(undefined);
    const account = { resetPassword } as unknown as AdminAccountService;
    const controller = new AdminsController({} as AdminsService, account);

    const result = await controller.resetPassword(42, SYSTEM_ADMIN, 'a-temporary-password');

    expect(result).toEqual({ ok: true });
    expect(resetPassword).toHaveBeenCalledWith(SYSTEM_ADMIN, 42, 'a-temporary-password');
  });
});
