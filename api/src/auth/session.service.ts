import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env';

// JWT (not a DB-backed session table) so requests can be verified with no
// extra database round trip. jose is used instead of jsonwebtoken because
// it was originally chosen for edge-runtime compatibility in the Next.js
// middleware this replaces (see PLAN.md) — no reason to swap it here.
export const SESSION_COOKIE = 'ac_admin_session';
export const CITIZEN_SESSION_COOKIE = 'ac_citizen_session';

export interface AdminSession {
  adminId: number;
  email: string;
  adminName: string;
  office: 'MEO' | 'MDRRMO';
  role: 'officer' | 'supervisor';
}

export interface CitizenSession {
  citizenId: number;
  email: string;
  citizenName: string;
}

@Injectable()
export class SessionService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: ConfigService<Env, true>) {
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

  async verifyAdminSession(token: string): Promise<AdminSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: 'admin',
      });
      return payload as unknown as AdminSession;
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

  async verifyCitizenSession(token: string): Promise<CitizenSession | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: 'citizen',
      });
      return payload as unknown as CitizenSession;
    } catch {
      return null;
    }
  }
}
