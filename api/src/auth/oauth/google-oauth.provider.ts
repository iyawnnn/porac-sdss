import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../../config/env';
import { normalizeEmail } from '../../common/utils/normalize-email';
import type { OAuthProfile } from './oauth-profile';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

@Injectable()
export class GoogleOAuthProvider {
  constructor(private readonly config: ConfigService<Env, true>) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private clientId(): string {
    const id = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!id) throw new Error('GOOGLE_CLIENT_ID is not configured.');
    return id;
  }

  private redirectUri(): string {
    const uri = this.config.get('GOOGLE_REDIRECT_URI', { infer: true });
    if (!uri) throw new Error('GOOGLE_REDIRECT_URI is not configured.');
    return uri;
  }

  // Exchanges the authorization code server-side and verifies the returned
  // ID token's signature, issuer, audience, expiry, and subject — never
  // trusts an unverified email out of the token.
  async resolveProfile(code: string): Promise<OAuthProfile> {
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', {
      infer: true,
    });
    if (!clientSecret)
      throw new Error('GOOGLE_CLIENT_SECRET is not configured.');

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId(),
        client_secret: clientSecret,
        code,
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new Error('Google token exchange failed.');
    }
    const tokenBody = (await tokenRes.json()) as { id_token?: unknown };
    if (typeof tokenBody.id_token !== 'string') {
      throw new Error('Google response did not include an ID token.');
    }

    const { payload } = await jwtVerify(tokenBody.id_token, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.clientId(),
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Google ID token missing subject.');
    }

    const email =
      typeof payload.email === 'string' && payload.email_verified === true
        ? normalizeEmail(payload.email)
        : null;

    return {
      subject: payload.sub,
      email,
      firstName:
        typeof payload.given_name === 'string' ? payload.given_name : 'Google',
      lastName:
        typeof payload.family_name === 'string' ? payload.family_name : 'User',
    };
  }
}
