import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { PasswordResetController } from './password-reset.controller';
import {
  PasswordResetRateLimitedError,
  PasswordResetService,
  TokenExpiredError,
  TokenNotFoundError,
  TokenUsedError,
  WeakPasswordError,
} from './password-reset.service';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers, ip: '9.9.9.9' } as unknown as Request;
}

describe('PasswordResetController.forgotPassword', () => {
  it('always returns { ok: true } for a well-formed email, regardless of what the service does internally', async () => {
    const requestReset = jest.fn().mockResolvedValue(undefined);
    const controller = new PasswordResetController({
      requestReset,
    } as unknown as PasswordResetService);

    const result = await controller.forgotPassword(makeReq(), {
      email: 'citizen@example.com',
    });
    expect(result).toEqual({ ok: true });
    expect(requestReset).toHaveBeenCalledWith('citizen@example.com', '9.9.9.9');
  });

  it('rejects a missing email before calling the service', async () => {
    const requestReset = jest.fn();
    const controller = new PasswordResetController({
      requestReset,
    } as unknown as PasswordResetService);

    await expect(
      controller.forgotPassword(makeReq(), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(requestReset).not.toHaveBeenCalled();
  });

  it('maps rate-limit rejection to 429', async () => {
    const requestReset = jest
      .fn()
      .mockRejectedValue(
        new PasswordResetRateLimitedError('Too many requests.'),
      );
    const controller = new PasswordResetController({
      requestReset,
    } as unknown as PasswordResetService);

    await expect(
      controller.forgotPassword(makeReq(), { email: 'citizen@example.com' }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('reads the first hop of x-forwarded-for as the client IP', async () => {
    const requestReset = jest.fn().mockResolvedValue(undefined);
    const controller = new PasswordResetController({
      requestReset,
    } as unknown as PasswordResetService);

    await controller.forgotPassword(
      makeReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }),
      { email: 'citizen@example.com' },
    );
    expect(requestReset).toHaveBeenCalledWith('citizen@example.com', '1.1.1.1');
  });
});

describe('PasswordResetController.validateResetToken', () => {
  it('returns valid: false without calling the service for a missing token', async () => {
    const validateToken = jest.fn();
    const controller = new PasswordResetController({
      validateToken,
    } as unknown as PasswordResetService);

    await expect(controller.validateResetToken(undefined)).resolves.toEqual({
      valid: false,
    });
    expect(validateToken).not.toHaveBeenCalled();
  });

  it('delegates to the service for a present token', async () => {
    const validateToken = jest.fn().mockResolvedValue(true);
    const controller = new PasswordResetController({
      validateToken,
    } as unknown as PasswordResetService);

    await expect(controller.validateResetToken('some-token')).resolves.toEqual({
      valid: true,
    });
  });
});

describe('PasswordResetController.resetPassword — error mapping', () => {
  const cases: [unknown, string][] = [
    [new TokenNotFoundError(), 'invalid_token'],
    [new TokenExpiredError(), 'expired_token'],
    [new TokenUsedError(), 'token_used'],
    [new WeakPasswordError(), 'weak_password'],
  ];

  it.each(cases)(
    'maps %p to a 400 with message %p',
    async (error, expectedMessage) => {
      const resetPassword = jest.fn().mockRejectedValue(error);
      const controller = new PasswordResetController({
        resetPassword,
      } as unknown as PasswordResetService);

      await expect(
        controller.resetPassword({
          token: 'x',
          newPassword: 'brand-new-password',
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { message: expectedMessage },
      });
    },
  );

  it('succeeds and returns { ok: true } without setting any cookie', async () => {
    const resetPassword = jest.fn().mockResolvedValue(undefined);
    const controller = new PasswordResetController({
      resetPassword,
    } as unknown as PasswordResetService);

    await expect(
      controller.resetPassword({
        token: 'x',
        newPassword: 'brand-new-password',
      }),
    ).resolves.toEqual({ ok: true });
  });
});
