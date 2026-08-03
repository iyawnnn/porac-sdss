import { ConfigService } from '@nestjs/config';
import { FacebookOAuthProvider } from './facebook-oauth.provider';
import type { Env } from '../../config/env';

function makeProvider(): FacebookOAuthProvider {
  const values: Record<string, string> = {
    FACEBOOK_APP_ID: 'test-app-id',
    FACEBOOK_REDIRECT_URI: 'http://localhost:3000/api/auth/facebook/callback',
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new FacebookOAuthProvider(config);
}

describe('FacebookOAuthProvider.authorizeUrl', () => {
  it('sends scope=public_profile,email with a literal comma, not %2C', () => {
    const url = makeProvider().authorizeUrl('some-state');
    // Regression guard for the "Invalid Scopes: email" bug: URLSearchParams
    // percent-encodes commas, and Facebook's dialog doesn't reliably split
    // a %2C-joined scope list back into separate permissions.
    expect(url).toContain('scope=public_profile,email');
    expect(url).not.toContain('%2C');
  });

  it('still points at the current Graph API dialog endpoint', () => {
    const url = makeProvider().authorizeUrl('some-state');
    expect(url.startsWith('https://www.facebook.com/v19.0/dialog/oauth?')).toBe(
      true,
    );
  });

  it('does not drop the email permission', () => {
    const url = makeProvider().authorizeUrl('some-state');
    const scope = new URL(url).searchParams.get('scope');
    expect(scope).toBe('public_profile,email');
  });
});
