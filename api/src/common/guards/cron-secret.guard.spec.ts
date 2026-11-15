import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { Env } from '../../config/env';
import { CronSecretGuard } from './cron-secret.guard';

const context = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('CronSecretGuard', () => {
  const config = {
    get: jest.fn().mockReturnValue('expected-secret'),
  } as unknown as ConfigService<Env, true>;
  const guard = new CronSecretGuard(config);

  it.each([
    [{ authorization: 'Bearer expected-secret' }],
    [{ 'x-cron-secret': 'expected-secret' }],
  ])('accepts the configured secret', (headers) => {
    expect(guard.canActivate(context(headers))).toBe(true);
  });

  it.each([
    [{ authorization: 'Bearer wrong-secret' }],
    [{ 'x-cron-secret': 'short' }],
    [{}],
  ])('rejects missing, mismatched, and different-length secrets', (headers) => {
    expect(() => guard.canActivate(context(headers))).toThrow(
      UnauthorizedException,
    );
  });
});
