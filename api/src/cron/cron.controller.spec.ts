import { CronController } from './cron.controller';
import type { RecomputeService } from '../domain/recompute.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { WeatherService } from '../domain/weather.service';
import type { PasswordResetService } from '../citizens/password-reset.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RateLimitService } from '../domain/ratelimit.service';

function makeController(overrides: {
  recomputeActiveTicketUrgency?: jest.Mock;
  recalculateActiveTickets?: jest.Mock;
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

  const recompute = {
    recomputeActiveTicketUrgency:
      overrides.recomputeActiveTicketUrgency ?? jest.fn(),
  } as unknown as RecomputeService;
  const operationalPriority = {
    recalculateActiveTickets: overrides.recalculateActiveTickets ?? jest.fn(),
  } as unknown as OperationalPriorityService;

  return new CronController(
    recompute,
    operationalPriority,
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

// Phase 1, step 2: the 7-day escalation job is gone. Route paths are read
// from Nest's own @Post() metadata, so this fails if the route (or a
// handler under another name serving the same path) ever comes back.
describe('CronController — escalation job removed', () => {
  const routePaths = Object.getOwnPropertyNames(CronController.prototype)
    .filter((name) => name !== 'constructor')
    .map(
      (name) =>
        Reflect.getMetadata(
          'path',
          (CronController.prototype as unknown as Record<string, object>)[name],
        ) as string | undefined,
    )
    .filter((path): path is string => typeof path === 'string');

  it('no longer exposes POST /cron/check-ticket-escalations', () => {
    expect(routePaths).not.toContain('check-ticket-escalations');
    expect('checkTicketEscalations' in CronController.prototype).toBe(false);
  });

  it('still exposes the other five cron routes', () => {
    expect(routePaths.sort()).toEqual(
      [
        'cleanup-notifications',
        'cleanup-password-reset-tokens',
        'cleanup-rate-limit-events',
        'recompute-urgency',
        'recompute-weather',
      ].sort(),
    );
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

describe('CronController.recomputeUrgency', () => {
  it('runs Hazard Urgency then Operational Priority and merges both results', async () => {
    const order: string[] = [];
    const recomputeActiveTicketUrgency = jest.fn().mockImplementation(() => {
      order.push('urgency');
      return Promise.resolve({ updated: 3, rain1hMm: 4.5 });
    });
    const recalculateActiveTickets = jest.fn().mockImplementation(() => {
      order.push('priority');
      return Promise.resolve({ updated: 3 });
    });
    const controller = makeController({
      recomputeActiveTicketUrgency,
      recalculateActiveTickets,
    });

    await expect(controller.recomputeUrgency()).resolves.toEqual({
      updated: 3,
      rain1hMm: 4.5,
      operationalPriorityUpdated: 3,
    });
    expect(order).toEqual(['urgency', 'priority']);
  });
});
