import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env';

export type OAuthProvider = 'google';
// 'login': the public sign-in/sign-up flow (unauthenticated). 'link': an
// authenticated citizen attaching a new provider identity to their account.
// 'reauth': an authenticated citizen re-proving control of a provider
// they've already linked, to unlock a sensitive action (unlink, first-time
// password setup). Only 'login' issues/creates a session — the other two
// operate on the citizen already authenticated via the session cookie.
export type OAuthStatePurpose = 'login' | 'link' | 'reauth';

export const OAUTH_STATE_COOKIE_PREFIX = 'ac_oauth_state_';
const STATE_TTL_SECONDS = 10 * 60;

export interface ConsumedState {
  purpose: OAuthStatePurpose;
  citizenId?: number;
}

// ponytail: nonce replay-tracking is an in-memory Map, good enough for a
// single long-lived NestJS process (matches how this app already deploys —
// see db.module.ts). A multi-instance deployment would need a shared store
// (Postgres table or Redis) instead.
interface UsedEntry {
  expiresAt: number;
}

@Injectable()
export class OAuthStateService {
  private readonly secret: Uint8Array;
  private readonly used = new Map<string, UsedEntry>();

  constructor(config: ConfigService<Env, true>) {
    const secret = config.get('OAUTH_STATE_SECRET', { infer: true });
    if (!secret) {
      throw new Error(
        'OAUTH_STATE_SECRET must be set to use OAuth login (api/.env).',
      );
    }
    this.secret = new TextEncoder().encode(secret);
  }

  private sweepExpired() {
    const now = Date.now();
    for (const [nonce, entry] of this.used) {
      if (entry.expiresAt < now) this.used.delete(nonce);
    }
  }

  // Returns the signed state token (goes in the provider's ?state=) and the
  // raw nonce (goes in a short-lived httpOnly cookie) — the callback must
  // present both, and they must match, before a state token is honored
  // (double-submit CSRF binding to the browser that started the flow).
  // citizenId is only meaningful (and only ever set) for purpose 'link' /
  // 'reauth' — the callback re-checks it against the caller's own current
  // session cookie, so a state token can never be replayed to act on a
  // different citizen than the one who started the flow.
  async issue(
    provider: OAuthProvider,
    purpose: OAuthStatePurpose = 'login',
    citizenId?: number,
  ): Promise<{ token: string; nonce: string }> {
    const nonce = randomUUID();
    const token = await new SignJWT({ nonce, provider, purpose, citizenId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('oauth-state')
      .setExpirationTime(`${STATE_TTL_SECONDS}s`)
      .sign(this.secret);
    return { token, nonce };
  }

  // Validates signature, expiry, provider match, and the cookie/token nonce
  // pairing, then consumes the nonce so the same state can never be
  // presented twice (replay protection). Throws on any failure — callers
  // should catch and map to a safe redirect error code, never surface the
  // reason to the client. Returns the bound purpose/citizenId so the caller
  // can branch the callback (login vs. link vs. reauth).
  async consume(
    provider: OAuthProvider,
    token: string,
    cookieNonce: string | undefined,
  ): Promise<ConsumedState> {
    this.sweepExpired();

    const { payload } = await jwtVerify(token, this.secret, {
      audience: 'oauth-state',
    });
    const nonce = payload.nonce;
    if (
      typeof nonce !== 'string' ||
      payload.provider !== provider ||
      !cookieNonce ||
      nonce !== cookieNonce
    ) {
      throw new Error('OAuth state mismatch');
    }
    if (this.used.has(nonce)) {
      throw new Error('OAuth state already used');
    }
    const exp =
      typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now();
    this.used.set(nonce, { expiresAt: exp });

    const purpose = payload.purpose;
    if (purpose !== 'login' && purpose !== 'link' && purpose !== 'reauth') {
      throw new Error('OAuth state has an invalid purpose');
    }
    const citizenId =
      typeof payload.citizenId === 'number' ? payload.citizenId : undefined;
    if (
      (purpose === 'link' || purpose === 'reauth') &&
      citizenId === undefined
    ) {
      throw new Error('OAuth state missing citizenId for link/reauth');
    }
    return { purpose, citizenId };
  }
}
