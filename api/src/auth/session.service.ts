import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins, citizens } from '../db/schema';
import type { Env } from '../config/env';

// JWT (not a DB-backed session table) so requests can be verified with no
// extra database round trip. jose is used instead of jsonwebtoken because
// it was originally chosen for edge-runtime compatibility in the Next.js
// middleware this replaces (see PLAN.md) — no reason to swap it here.
export const SESSION_COOKIE = 'ac_admin_session';
export const CITIZEN_SESSION_COOKIE = 'ac_citizen_session';
// Short-lived proof of "this citizen recently reauthenticated" (current
// password, or a fresh provider round-trip) — gates unlink and first-time
// password setup on the Account & Security page. Separate cookie/audience
// from the session itself so it can carry a much shorter expiry without
// touching the 30-day session cookie.
export const CITIZEN_REAUTH_COOKIE = 'ac_citizen_reauth';
const REAUTH_TTL = '10m';

export interface AdminSession {
  adminId: number;
  email: string;
  adminName: string;
  // null only for role: 'system_admin' — every officer/supervisor is
  // pinned to exactly one office. See api/src/common/authz/admin-scope.ts.
  office: 'MEO' | 'MDRRMO' | null;
  role: 'officer' | 'supervisor' | 'system_admin';
}

export interface CitizenSession {
  citizenId: number;
  email: string;
  citizenName: string;
}

export interface ReauthSession {
  citizenId: number;
}

@Injectable()
export class SessionService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DB) private readonly db: PostgresJsDatabase,
  ) {
    this.secret = new TextEncoder().encode(
      this.config.get('JWT_SECRET', { infer: true }),
    );
  }

  // Both token types share one JWT_SECRET, so the `aud` claim is the only
  // thing that stops a citizen token from being accepted as an admin one
  // (or vice versa) if it's ever placed in the wrong cookie — jwtVerify()
  // throws on an audience mismatch, which verifyAdminSession/
  // verifyCitizenSession below turn into a clean `null` rather than a
  // half-populated session object.
  async signAdminSession(session: AdminSession): Promise<string> {
    return new SignJWT({ ...session })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('admin')
      .setExpirationTime('8h')
      .sign(this.secret);
  }

  // Mirrors verifyCitizenSession's session_valid_after check below (added
  // for admin password change/reset) — the same DB-read tradeoff is
  // accepted here for the same reason: this is the only way a stateless
  // JWT admin session can be invalidated server-side after a credential
  // change, and password security is exactly the case that tradeoff exists
  // for.
  //
  // Compared in whole seconds, not iat*1000 vs a millisecond timestamp:
  // admin-account.controller.ts writes session_valid_after and then signs
  // the rotated cookie for the *same* request a few ms later, so the two
  // can legitimately land in the same wall-clock second. iat only has
  // second resolution — floor(sessionValidAfter) is the earliest iat that
  // could possibly have been issued after the write, so anything at or
  // after that floor is accepted. This only widens acceptance by up to one
  // second right at the boundary; a token from a genuinely earlier second
  // is still rejected exactly as before.
  async verifyAdminSession(token: string): Promise<AdminSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: 'admin',
      });
      const session = payload as unknown as AdminSession;

      const [admin] = await this.db
        .select({ sessionValidAfter: admins.sessionValidAfter })
        .from(admins)
        .where(eq(admins.id, session.adminId));
      if (
        admin?.sessionValidAfter &&
        typeof payload.iat === 'number' &&
        payload.iat < Math.floor(admin.sessionValidAfter.getTime() / 1000)
      ) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  async signCitizenSession(session: CitizenSession): Promise<string> {
    return new SignJWT({ ...session })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('citizen')
      .setExpirationTime('30d')
      .sign(this.secret);
  }

  // A successful password reset (auth/citizens/password-reset flow) sets
  // citizens.session_valid_after = now(), which is now compared against
  // this token's iat — the same DB-read tradeoff verifyAdminSession above
  // now also makes, for the admin-side password change/reset equivalent.
  async verifyCitizenSession(token: string): Promise<CitizenSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: 'citizen',
      });
      const session = payload as unknown as CitizenSession;

      const [citizen] = await this.db
        .select({ sessionValidAfter: citizens.sessionValidAfter })
        .from(citizens)
        .where(eq(citizens.id, session.citizenId));
      if (
        citizen?.sessionValidAfter &&
        typeof payload.iat === 'number' &&
        payload.iat * 1000 < citizen.sessionValidAfter.getTime()
      ) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  // Deliberately its own aud ('citizen-reauth') and a much shorter TTL than
  // the session token, so a leaked/expired reauth proof can't be replayed
  // as a session and vice versa — same reasoning as the admin/citizen split
  // above, applied to a third token kind.
  async signReauth(citizenId: number): Promise<string> {
    return new SignJWT({ citizenId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('citizen-reauth')
      .setExpirationTime(REAUTH_TTL)
      .sign(this.secret);
  }

  async verifyReauth(token: string): Promise<ReauthSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: 'citizen-reauth',
      });
      return payload as unknown as ReauthSession;
    } catch {
      return null;
    }
  }
}
