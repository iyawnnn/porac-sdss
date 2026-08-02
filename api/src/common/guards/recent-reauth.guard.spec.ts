import { HttpException, type ExecutionContext } from '@nestjs/common';
import { RecentReauthGuard } from './recent-reauth.guard';
import { SessionService } from '../../auth/session.service';
import type { RequestWithCitizen } from './citizen-session.guard';

function makeContext(
  cookies: Record<string, string>,
  citizenSession: { citizenId: number } | undefined,
): ExecutionContext {
  const req = { cookies, citizenSession } as unknown as RequestWithCitizen;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RecentReauthGuard', () => {
  it('allows a request with a fresh, matching reauth cookie', async () => {
    const verifyReauth = jest.fn().mockResolvedValue({ citizenId: 7 });
    const sessions = { verifyReauth } as unknown as SessionService;
    const guard = new RecentReauthGuard(sessions);
    const ctx = makeContext({ ac_citizen_reauth: 'a-token' }, { citizenId: 7 });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when there is no reauth cookie at all', async () => {
    const verifyReauth = jest.fn();
    const sessions = { verifyReauth } as unknown as SessionService;
    const guard = new RecentReauthGuard(sessions);
    const ctx = makeContext({}, { citizenId: 7 });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(verifyReauth).not.toHaveBeenCalled();
  });

  it('rejects an expired/invalid reauth cookie', async () => {
    const verifyReauth = jest.fn().mockResolvedValue(null);
    const sessions = { verifyReauth } as unknown as SessionService;
    const guard = new RecentReauthGuard(sessions);
    const ctx = makeContext({ ac_citizen_reauth: 'stale' }, { citizenId: 7 });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects a reauth cookie proving a different citizen than the current session', async () => {
    const verifyReauth = jest.fn().mockResolvedValue({ citizenId: 999 });
    const sessions = { verifyReauth } as unknown as SessionService;
    const guard = new RecentReauthGuard(sessions);
    const ctx = makeContext({ ac_citizen_reauth: 'a-token' }, { citizenId: 7 });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});
