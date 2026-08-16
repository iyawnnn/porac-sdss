import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  SessionService,
  type AdminSession,
  type CitizenSession,
} from './session.service';
import type { Env } from '../config/env';

function chain(result: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeSessionService(
  sessionValidAfter: Date | null = null,
  isActive = true,
): SessionService {
  const config = {
    get: () => 'a-test-secret-that-is-at-least-32-bytes-long',
  } as unknown as ConfigService<Env, true>;
  const select = jest
    .fn()
    .mockReturnValue(chain([{ sessionValidAfter, isActive }]));
  const db = { select } as unknown as PostgresJsDatabase;
  return new SessionService(config, db);
}

const adminPayload: AdminSession = {
  adminId: 1,
  email: 'admin@example.com',
  adminName: 'Admin Name',
  office: 'MEO',
  role: 'officer',
};

const citizenPayload: CitizenSession = {
  citizenId: 1,
  email: 'citizen@example.com',
  citizenName: 'Citizen Name',
};

describe('SessionService', () => {
  it('round-trips a valid admin session', async () => {
    const sessions = makeSessionService();
    const token = await sessions.signAdminSession(adminPayload);
    const verified = await sessions.verifyAdminSession(token);
    expect(verified).toMatchObject(adminPayload);
  });

  it('round-trips a valid citizen session', async () => {
    const sessions = makeSessionService();
    const token = await sessions.signCitizenSession(citizenPayload);
    const verified = await sessions.verifyCitizenSession(token);
    expect(verified).toMatchObject(citizenPayload);
  });

  // The security fix this phase adds: both token types share one
  // JWT_SECRET, so without an audience check a citizen token placed in the
  // admin cookie would pass jwtVerify and produce a session with
  // office/role silently undefined instead of being rejected outright.
  it('rejects a citizen token presented as an admin session', async () => {
    const sessions = makeSessionService();
    const citizenToken = await sessions.signCitizenSession(citizenPayload);
    await expect(sessions.verifyAdminSession(citizenToken)).resolves.toBeNull();
  });

  it('rejects an admin token presented as a citizen session', async () => {
    const sessions = makeSessionService();
    const adminToken = await sessions.signAdminSession(adminPayload);
    await expect(sessions.verifyCitizenSession(adminToken)).resolves.toBeNull();
  });

  it('round-trips a valid reauth token', async () => {
    const sessions = makeSessionService();
    const token = await sessions.signReauth(citizenPayload.citizenId);
    const verified = await sessions.verifyReauth(token);
    expect(verified).toMatchObject({ citizenId: citizenPayload.citizenId });
  });

  it('rejects a citizen session token presented as a reauth token', async () => {
    const sessions = makeSessionService();
    const citizenToken = await sessions.signCitizenSession(citizenPayload);
    await expect(sessions.verifyReauth(citizenToken)).resolves.toBeNull();
  });

  it('rejects a reauth token presented as a citizen session', async () => {
    const sessions = makeSessionService();
    const reauthToken = await sessions.signReauth(citizenPayload.citizenId);
    await expect(
      sessions.verifyCitizenSession(reauthToken),
    ).resolves.toBeNull();
  });

  describe('session_valid_after invalidation (password reset)', () => {
    it('rejects a citizen token issued before session_valid_after', async () => {
      const sessions = makeSessionService(new Date(Date.now() + 60_000));
      const token = await sessions.signCitizenSession(citizenPayload);
      await expect(sessions.verifyCitizenSession(token)).resolves.toBeNull();
    });

    it('accepts a citizen token issued after session_valid_after', async () => {
      const sessions = makeSessionService(new Date(Date.now() - 60_000));
      const token = await sessions.signCitizenSession(citizenPayload);
      await expect(sessions.verifyCitizenSession(token)).resolves.toMatchObject(
        citizenPayload,
      );
    });

    it('accepts any token when session_valid_after is null (default, untouched accounts)', async () => {
      const sessions = makeSessionService(null);
      const token = await sessions.signCitizenSession(citizenPayload);
      await expect(sessions.verifyCitizenSession(token)).resolves.toMatchObject(
        citizenPayload,
      );
    });
  });

  describe('session_valid_after invalidation (admin password change/reset)', () => {
    it('rejects an admin token issued before session_valid_after', async () => {
      const sessions = makeSessionService(new Date(Date.now() + 60_000));
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toBeNull();
    });

    it('accepts an admin token issued after session_valid_after', async () => {
      const sessions = makeSessionService(new Date(Date.now() - 60_000));
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toMatchObject(
        adminPayload,
      );
    });

    it('accepts any admin token when session_valid_after is null (default, untouched accounts)', async () => {
      const sessions = makeSessionService(null);
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toMatchObject(
        adminPayload,
      );
    });
  });

  describe('invalidateAdminSession / invalidateCitizenSession (logout)', () => {
    function makeSessionServiceWithUpdate() {
      const config = {
        get: () => 'a-test-secret-that-is-at-least-32-bytes-long',
      } as unknown as ConfigService<Env, true>;
      const set = jest.fn().mockReturnValue({ where: jest.fn() });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as unknown as PostgresJsDatabase;
      return { sessions: new SessionService(config, db), update, set };
    }

    it('invalidateAdminSession bumps session_valid_after for that admin id', async () => {
      const { sessions, update, set } = makeSessionServiceWithUpdate();
      await sessions.invalidateAdminSession(42);
      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith({ sessionValidAfter: expect.any(Date) });
    });

    it('invalidateCitizenSession bumps session_valid_after for that citizen id', async () => {
      const { sessions, update, set } = makeSessionServiceWithUpdate();
      await sessions.invalidateCitizenSession(7);
      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith({ sessionValidAfter: expect.any(Date) });
    });

    it('a token issued before an invalidateAdminSession-triggered bump is rejected', async () => {
      // End-to-end proof the two pieces (invalidate + verify) actually
      // compose: sign a token "now", then simulate logout having bumped
      // session_valid_after a second later, then verify against that state.
      const sessions = makeSessionService(new Date(Date.now() + 1_000));
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toBeNull();
    });
  });

  describe('is_active invalidation (admin deactivation)', () => {
    it('rejects an admin token for a deactivated account, even with no session_valid_after set', async () => {
      const sessions = makeSessionService(null, false);
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toBeNull();
    });

    it('accepts an admin token for an active account', async () => {
      const sessions = makeSessionService(null, true);
      const token = await sessions.signAdminSession(adminPayload);
      await expect(sessions.verifyAdminSession(token)).resolves.toMatchObject(
        adminPayload,
      );
    });
  });
});
