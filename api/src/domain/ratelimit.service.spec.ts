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
