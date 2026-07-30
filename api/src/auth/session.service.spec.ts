import { ConfigService } from '@nestjs/config';
import {
  SessionService,
  type AdminSession,
  type CitizenSession,
} from './session.service';
import type { Env } from '../config/env';

function makeSessionService(): SessionService {
  const config = {
    get: () => 'a-test-secret-that-is-at-least-32-bytes-long',
  } as unknown as ConfigService<Env, true>;
  return new SessionService(config);
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
});
