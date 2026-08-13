import type { Sql } from 'postgres';
import { RateLimitService } from './ratelimit.service';

function makePg(results: unknown[]): Sql {
  const pg = jest.fn();
  for (const result of results) {
    pg.mockResolvedValueOnce(result);
  }
  return pg as unknown as Sql;
}

describe('RateLimitService.checkPasswordResetRateLimit', () => {
  it('allows a request under both the email and IP limits', async () => {
    const pg = makePg([[{ count: 0 }], [{ count: 0 }]]);
    const service = new RateLimitService(pg);

    await expect(
      service.checkPasswordResetRateLimit('1.2.3.4', 'citizen@example.com'),
    ).resolves.toEqual({ allowed: true });
  });

  it('rejects once the email-hourly limit is hit, even from a fresh IP', async () => {
    const pg = makePg([[{ count: 3 }]]);
    const service = new RateLimitService(pg);

    const result = await service.checkPasswordResetRateLimit(
      '1.2.3.4',
      'citizen@example.com',
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/email/i);
  });

  it('rejects once the IP-hourly limit is hit, even for a fresh email (checked independently, not OR-weakened)', async () => {
    const pg = makePg([[{ count: 0 }], [{ count: 10 }]]);
    const service = new RateLimitService(pg);

    const result = await service.checkPasswordResetRateLimit(
      '1.2.3.4',
      'citizen@example.com',
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/network/i);
  });
});

describe('RateLimitService.recordPasswordResetAttempt', () => {
  it('records an attempt even for an email that does not correspond to any citizen', async () => {
    const pg = jest.fn().mockResolvedValue(undefined);
    const service = new RateLimitService(pg as unknown as Sql);

    await service.recordPasswordResetAttempt('1.2.3.4', 'nobody@example.com');
    expect(pg).toHaveBeenCalledTimes(1);
  });
});

describe('RateLimitService.checkAdminLoginRateLimit', () => {
  it('allows a request under the failure limit', async () => {
    const pg = makePg([[{ count: 9 }]]);
    const service = new RateLimitService(pg);

    await expect(
      service.checkAdminLoginRateLimit('meo@porac.gov.ph'),
    ).resolves.toEqual({ allowed: true });
  });

  it('rejects once the failure limit is hit', async () => {
    const pg = makePg([[{ count: 10 }]]);
    const service = new RateLimitService(pg);

    const result = await service.checkAdminLoginRateLimit('meo@porac.gov.ph');
    expect(result.allowed).toBe(false);
  });
});

describe('RateLimitService.recordAdminLoginFailure', () => {
  it('records a failure keyed on the normalized email', async () => {
    const pg = jest.fn().mockResolvedValue(undefined);
    const service = new RateLimitService(pg as unknown as Sql);

    await service.recordAdminLoginFailure('meo@porac.gov.ph');
    expect(pg).toHaveBeenCalledTimes(1);
    const query = (pg.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(query).toContain('INSERT INTO admin_login_rate_limit_events');
  });
});

describe('RateLimitService.resetAdminLoginFailures', () => {
  it('deletes every failure row for that email, not just ones inside the check window', async () => {
    const pg = jest.fn().mockResolvedValue(undefined);
    const service = new RateLimitService(pg as unknown as Sql);

    await service.resetAdminLoginFailures('meo@porac.gov.ph');
    expect(pg).toHaveBeenCalledTimes(1);
    const query = (pg.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(query).toContain('DELETE FROM admin_login_rate_limit_events');
    expect(query).not.toContain('created_at');
  });
});

describe('RateLimitService.cleanupOldEvents', () => {
  const RETENTION_DAYS = 30;
  // The longest active window any table's checks ever query — anything
  // older than this can never affect a live rate-limit decision.
  const LONGEST_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

  it('deletes from all three rate-limit tables using a cutoff well past every active window', async () => {
    const pg = makePg([{ count: 4 }, { count: 1 }, { count: 2 }]);
    const service = new RateLimitService(pg);

    const before = Date.now();
    const result = await service.cleanupOldEvents();
    const after = Date.now();

    expect(result).toEqual({
      rateLimitEventsDeleted: 4,
      passwordResetRateLimitEventsDeleted: 1,
      adminLoginRateLimitEventsDeleted: 2,
    });
    expect(pg).toHaveBeenCalledTimes(3);

    const queries = (pg as unknown as jest.Mock).mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(''),
    );
    expect(
      queries.some((q) => q.includes('DELETE FROM rate_limit_events')),
    ).toBe(true);
    expect(
      queries.some((q) =>
        q.includes('DELETE FROM password_reset_rate_limit_events'),
      ),
    ).toBe(true);
    expect(
      queries.some((q) =>
        q.includes('DELETE FROM admin_login_rate_limit_events'),
      ),
    ).toBe(true);

    // All three calls bind the same cutoff (their second template argument)
    // — confirm it's ~30 days ago, not some other window.
    for (const call of (pg as unknown as jest.Mock).mock.calls) {
      const cutoff = (call[1] as Date).getTime();
      const expectedCutoff = RETENTION_DAYS * 24 * 60 * 60 * 1000;
      expect(before - cutoff).toBeGreaterThanOrEqual(expectedCutoff - 1000);
      expect(after - cutoff).toBeLessThanOrEqual(expectedCutoff + 1000);
      // And that cutoff sits well outside the longest window any
      // rate-limit check ever queries, so nothing still "active" is at risk.
      expect(before - cutoff).toBeGreaterThan(LONGEST_ACTIVE_WINDOW_MS);
    }
  });

  it('never targets rows inside the active rate-limit window (only WHERE created_at < cutoff, no upper bound that could exclude old-but-still-relevant rows)', async () => {
    const pg = makePg([{ count: 0 }, { count: 0 }, { count: 0 }]);
    const service = new RateLimitService(pg);

    await service.cleanupOldEvents();

    const queries = (pg as unknown as jest.Mock).mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(''),
    );
    for (const q of queries) {
      expect(q).toContain('WHERE created_at <');
    }
  });
});
