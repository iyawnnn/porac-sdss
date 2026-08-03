import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import type { Env } from '../config/env';

// Shared by auth.controller.ts (login/signup), oauth.controller.ts
// (callback + link/reauth), and citizens/account.controller.ts (session
// rotation, reauth cookie) — every place that sets a citizen-facing cookie
// needs the same httpOnly/secure/sameSite/path shape, only maxAge differs.
export function citizenCookieOptions(
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

export const CITIZEN_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CITIZEN_REAUTH_MAX_AGE_MS = 10 * 60 * 1000;
