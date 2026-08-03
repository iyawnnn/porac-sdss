import { jwtVerify } from "jose";

// Same JWT pattern as admin auth (see lib/auth/session.ts) — separate
// cookie/type because citizen sessions carry no office/role, and mixing
// the two payload shapes under one cookie would make it easy to forget
// which kind of session a given route is actually checking.
const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export const CITIZEN_SESSION_COOKIE = "ac_citizen_session";

export interface CitizenSession {
  citizenId: number;
  email: string;
  citizenName: string;
}

export async function verifyCitizenSession(token: string): Promise<CitizenSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as CitizenSession;
  } catch {
    return null;
  }
}
