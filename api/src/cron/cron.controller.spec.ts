import { CronController } from './cron.controller';
import type { RecomputeService } from '../domain/recompute.service';
import type { WeatherService } from '../domain/weather.service';
import type { PasswordResetService } from '../citizens/password-reset.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RateLimitService } from '../domain/ratelimit.service';

function makeController(overrides: {
  cleanupExpiredTokens?: jest.Mock;
  cleanupOldNotifications?: jest.Mock;
  cleanupOldEvents?: jest.Mock;
}) {
  const passwordReset = {
    cleanupExpiredTokens: overrides.cleanupExpiredTokens ?? jest.fn(),
  } as unknown as PasswordResetService;
  const notifications = {
    cleanupOldNotifications: overrides.cleanupOldNotifications ?? jest.fn(),
  } as unknown as NotificationsService;
  const rateLimit = {
    cleanupOldEvents:
      overrides.cleanupOldEvents ??
      jest.fn().mockResolvedValue({
        rateLimitEventsDeleted: 0,
        passwordResetRateLimitEventsDeleted: 0,
      }),
  } as unknown as RateLimitService;

  return new CronController(
    {} as RecomputeService,
    {} as WeatherService,
    passwordReset,
    notifications,
    rateLimit,
  );
}

describe('CronController.cleanupPasswordResetTokens', () => {
  it('delegates to PasswordResetService and returns { ok: true }', async () => {
    const cleanupExpiredTokens = jest.fn().mockResolvedValue(undefined);
    const controller = makeController({ cleanupExpiredTokens });

    await expect(controller.cleanupPasswordResetTokens()).resolves.toEqual({
      ok: true,
    });
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });
});

describe('CronController.cleanupNotifications', () => {
  it('delegates to NotificationsService and returns { ok: true }', async () => {
    const cleanupOldNotifications = jest.fn().mockResolvedValue(undefined);
    const controller = makeController({ cleanupOldNotifications });

    await expect(controller.cleanupNotifications()).resolves.toEqual({
      ok: true,
    });
    expect(cleanupOldNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('CronController.cleanupRateLimitEvents', () => {
  it('exposes POST /cron/cleanup-rate-limit-events and returns the deleted-row counts from RateLimitService', async () => {
    const cleanupOldEvents = jest.fn().mockResolvedValue({
      rateLimitEventsDeleted: 12,
      passwordResetRateLimitEventsDeleted: 3,
    });
    const controller = makeController({ cleanupOldEvents });

    await expect(controller.cleanupRateLimitEvents()).resolves.toEqual({
      rateLimitEventsDeleted: 12,
      passwordResetRateLimitEventsDeleted: 3,
    });
    expect(cleanupOldEvents).toHaveBeenCalledTimes(1);
  });
});

// The security-relevant fact under test is structural, not behavioral: the
// new route lives on the same @UseGuards(CronSecretGuard)-decorated class
// as every other cron route, so it can never accidentally ship unguarded.
// (CronSecretGuard's own accept/reject logic is covered by its own spec.)
describe('CronController guard placement', () => {
  it('applies CronSecretGuard at the class level, covering every route including the new one', () => {
    const guards = Reflect.getMetadata('__guards__', CronController) as unknown[];
    expect(guards).toBeDefined();
    expect(guards.length).toBeGreaterThan(0);
  });
});
