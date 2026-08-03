import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { normalizeEmail } from '../../common/utils/normalize-email';
import type { OAuthProfile } from './oauth-profile';

const GRAPH_VERSION = 'v19.0';

@Injectable()
export class FacebookOAuthProvider {
  constructor(private readonly config: ConfigService<Env, true>) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      state,
    });
    // Built separately from URLSearchParams: it percent-encodes the comma
    // to %2C, and Facebook's /dialog/oauth scope parser doesn't reliably
    // split that back into separate permissions — it needs a literal `,`.
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}&scope=public_profile,email`;
  }

  private appId(): string {
    const id = this.config.get('FACEBOOK_APP_ID', { infer: true });
    if (!id) throw new Error('FACEBOOK_APP_ID is not configured.');
    return id;
  }

  private redirectUri(): string {
    const uri = this.config.get('FACEBOOK_REDIRECT_URI', { infer: true });
    if (!uri) throw new Error('FACEBOOK_REDIRECT_URI is not configured.');
    return uri;
  }

  // Exchanges the authorization code server-side, then fetches only the
  // fields we need (id, email) — Facebook accounts frequently have no email
  // on file, so callers must treat a missing email as a real case, not an
  // error in this layer.
  async resolveProfile(code: string): Promise<OAuthProfile> {
    const appSecret = this.config.get('FACEBOOK_APP_SECRET', { infer: true });
    if (!appSecret) throw new Error('FACEBOOK_APP_SECRET is not configured.');

    const tokenParams = new URLSearchParams({
      client_id: this.appId(),
      client_secret: appSecret,
      redirect_uri: this.redirectUri(),
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${tokenParams.toString()}`,
    );
    if (!tokenRes.ok) {
      throw new Error('Facebook token exchange failed.');
    }
    const tokenBody = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof tokenBody.access_token !== 'string') {
      throw new Error('Facebook response did not include an access token.');
    }

    const profileParams = new URLSearchParams({
      fields: 'id,email,first_name,last_name',
      access_token: tokenBody.access_token,
    });
    const profileRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me?${profileParams.toString()}`,
    );
    if (!profileRes.ok) {
      throw new Error('Facebook profile fetch failed.');
    }
    const profile = (await profileRes.json()) as {
      id?: unknown;
      email?: unknown;
      first_name?: unknown;
      last_name?: unknown;
    };
    if (typeof profile.id !== 'string' || profile.id.length === 0) {
      throw new Error('Facebook profile missing id.');
    }

    const email =
      typeof profile.email === 'string' ? normalizeEmail(profile.email) : null;

    return {
      subject: profile.id,
      email,
      firstName:
        typeof profile.first_name === 'string'
          ? profile.first_name
          : 'Facebook',
      lastName:
        typeof profile.last_name === 'string' ? profile.last_name : 'User',
    };
  }
}
