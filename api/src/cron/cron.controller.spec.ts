import { CronController } from './cron.controller';
import type { RecomputeService } from '../domain/recompute.service';
import type { WeatherService } from '../domain/weather.service';
import type { PasswordResetService } from '../citizens/password-reset.service';

describe('CronController.cleanupPasswordResetTokens', () => {
  it('delegates to PasswordResetService and returns { ok: true }', async () => {
    const cleanupExpiredTokens = jest.fn().mockResolvedValue(undefined);
    const controller = new CronController(
      {} as RecomputeService,
      {} as WeatherService,
      { cleanupExpiredTokens } as unknown as PasswordResetService,
    );

    await expect(controller.cleanupPasswordResetTokens()).resolves.toEqual({
      ok: true,
    });
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });
});
