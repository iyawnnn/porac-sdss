import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import type { Env } from '../config/env';

// Shared by auth.controller.ts (login) and admin/admin-account.controller.ts
// (session rotation after an admin changes their own password) — every
// place that sets the admin-facing cookie needs the same
// httpOnly/secure/sameSite/path shape. Mirrors citizen-cookie.util.ts.
export function adminCookieOptions(
  config: ConfigService<Env, true>,
  maxAgeMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('NODE_ENV', { infer: true }) === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
