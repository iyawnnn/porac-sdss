import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env';
import {
  CITIZEN_REAUTH_COOKIE,
  CITIZEN_SESSION_COOKIE,
  SessionService,
} from '../session.service';
import {
  citizenCookieOptions,
  CITIZEN_REAUTH_MAX_AGE_MS,
  CITIZEN_SESSION_MAX_AGE_MS,
} from '../citizen-cookie.util';
import {
  OAUTH_STATE_COOKIE_PREFIX,
  OAuthStateService,
  type ConsumedState,
  type OAuthProvider,
  type OAuthStatePurpose,
} from '../oauth-state.service';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { FacebookOAuthProvider } from './facebook-oauth.provider';
import {
  AccountLinkRequiredError,
  EmailRequiredError,
  IdentityConflictError,
  OAuthService,
} from './oauth.service';
import { OAuthRateLimitGuard } from '../../common/guards/oauth-rate-limit.guard';

type LoginErrorCode =
  | 'account_link_required'
  | 'email_required'
  | 'oauth_cancelled'
  | 'oauth_failed';

type AccountErrorCode = 'identity_conflict' | 'reauth_failed' | 'oauth_failed';

@Controller('auth')
@UseGuards(OAuthRateLimitGuard)
export class OAuthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly state: OAuthStateService,
    private readonly sessions: SessionService,
    private readonly google: GoogleOAuthProvider,
    private readonly facebook: FacebookOAuthProvider,
    private readonly oauth: OAuthService,
  ) {}

  private webOrigin(): string {
    const origin = this.config.get('WEB_ORIGIN', { infer: true });
    if (!origin) throw new Error('WEB_ORIGIN is not configured.');
    return origin;
  }

  // Stage-marker tracing for the OAuth flow — dev/test only, never in
  // production. Logs booleans/ids/error names only, never secrets/tokens.
  private debugLog(message: string, meta?: Record<string, unknown>) {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') return;
    if (meta) console.log(message, meta);
    else console.log(message);
  }

  private async start(
    provider: OAuthProvider,
    req: Request,
    res: Response,
    mode: string | undefined,
    authorizeUrl: (state: string) => string,
  ) {
    let purpose: OAuthStatePurpose = 'login';
    let citizenId: number | undefined;

    // mode=link/reauth is only ever reachable from the authenticated
    // Account & Security page — the public /api/auth/<provider> login
    // link never sends it, so unauthenticated login behavior is untouched.
    if (mode === 'link' || mode === 'reauth') {
      const token = req.cookies?.[CITIZEN_SESSION_COOKIE] as string | undefined;
      const session = token
        ? await this.sessions.verifyCitizenSession(token)
        : null;
      if (!session) {
        res.redirect(`${this.webOrigin()}/login`);
        return;
      }
      purpose = mode;
      citizenId = session.citizenId;
    }

    this.debugLog(`[oauth:${provider}] stage=start received`, { purpose });
    const { token, nonce } = await this.state.issue(
      provider,
      purpose,
      citizenId,
    );
    res.cookie(
      `${OAUTH_STATE_COOKIE_PREFIX}${provider}`,
      nonce,
      citizenCookieOptions(this.config, 10 * 60 * 1000),
    );
    const url = authorizeUrl(token);
    this.debugLog(`[oauth:${provider}] stage=start redirecting to provider`, {
      endpoint: url.split('?')[0],
    });
    res.redirect(url);
  }

  @Get('google')
  async googleStart(
    @Req() req: Request,
    @Res() res: Response,
    @Query('mode') mode?: string,
  ) {
    await this.start('google', req, res, mode, (state) =>
      this.google.authorizeUrl(state),
    );
  }

  @Get('facebook')
  async facebookStart(
    @Req() req: Request,
    @Res() res: Response,
    @Query('mode') mode?: string,
  ) {
    await this.start('facebook', req, res, mode, (state) =>
      this.facebook.authorizeUrl(state),
    );
  }

  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') stateToken?: string,
    @Query('error') providerError?: string,
  ) {
    await this.handleCallback(
      'google',
      req,
      res,
      code,
      stateToken,
      providerError,
      (c) => this.google.resolveProfile(c),
    );
  }

  @Get('facebook/callback')
  async facebookCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') stateToken?: string,
    @Query('error') providerError?: string,
  ) {
    await this.handleCallback(
      'facebook',
      req,
      res,
      code,
      stateToken,
      providerError,
      (c) => this.facebook.resolveProfile(c),
    );
  }

  private async handleCallback(
    provider: OAuthProvider,
    req: Request,
    res: Response,
    code: string | undefined,
    stateToken: string | undefined,
    providerError: string | undefined,
    resolveProfile: (
      code: string,
    ) => Promise<import('./oauth-profile').OAuthProfile>,
  ) {
    const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
    res.cookie(cookieName, '', { path: '/', maxAge: 0 });

    this.debugLog(`[oauth:${provider}] callback received`, {
      hasCode: Boolean(code),
      hasState: Boolean(stateToken),
      providerError: providerError ?? null,
    });

    // Purpose isn't known yet without consuming state, so cancellation and
    // missing-param failures fall back to the public /login redirect — an
    // already-authenticated citizen bounces harmlessly on to /dashboard
    // from there. The failure paths that matter (identity conflict, reauth
    // mismatch) are handled below once state is consumed and the purpose
    // is known.
    if (providerError) {
      this.debugLog(
        `[oauth:${provider}] stage=provider_error -> oauth_cancelled`,
      );
      return this.redirectWithLoginError(res, 'oauth_cancelled');
    }
    if (!code || !stateToken) {
      this.debugLog(
        `[oauth:${provider}] stage=missing_code_or_state -> oauth_failed`,
      );
      return this.redirectWithLoginError(res, 'oauth_failed');
    }

    let consumed: ConsumedState;
    try {
      const cookieNonce = req.cookies?.[cookieName] as string | undefined;
      this.debugLog(`[oauth:${provider}] stage=state_consume start`, {
        hasCookieNonce: Boolean(cookieNonce),
      });
      consumed = await this.state.consume(provider, stateToken, cookieNonce);
      this.debugLog(`[oauth:${provider}] stage=state_consume ok`, {
        purpose: consumed.purpose,
      });
    } catch (err) {
      this.debugLog(`[oauth:${provider}] stage=state_consume FAILED`, {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return this.redirectWithLoginError(res, 'oauth_failed');
    }

    try {
      this.debugLog(
        `[oauth:${provider}] stage=token_exchange_and_profile start`,
      );
      const profile = await resolveProfile(code);
      this.debugLog(`[oauth:${provider}] stage=token_exchange_and_profile ok`, {
        hasEmail: Boolean(profile.email),
      });

      if (consumed.purpose === 'login') {
        this.debugLog(
          `[oauth:${provider}] stage=citizen_lookup_or_create start`,
        );
        const { token } = await this.oauth.loginOrCreate(provider, profile);
        this.debugLog(`[oauth:${provider}] stage=citizen_lookup_or_create ok`);

        res.cookie(
          CITIZEN_SESSION_COOKIE,
          token,
          citizenCookieOptions(this.config, CITIZEN_SESSION_MAX_AGE_MS),
        );
        const dest = `${this.webOrigin()}/dashboard`;
        this.debugLog(`[oauth:${provider}] stage=redirect ok`, { dest });
        return res.redirect(dest);
      }

      // 'link' / 'reauth': the state was bound to a specific citizenId at
      // issue time; re-verify the browser's *current* session cookie still
      // belongs to that same citizen before acting — defense in depth
      // beyond the state token's own claim.
      const currentToken = req.cookies?.[CITIZEN_SESSION_COOKIE] as
        string | undefined;
      const currentSession = currentToken
        ? await this.sessions.verifyCitizenSession(currentToken)
        : null;
      if (!currentSession || currentSession.citizenId !== consumed.citizenId) {
        this.debugLog(
          `[oauth:${provider}] stage=session_mismatch -> oauth_failed`,
        );
        return this.redirectWithAccountError(res, 'oauth_failed');
      }

      if (consumed.purpose === 'link') {
        try {
          await this.oauth.linkIdentity(consumed.citizenId, provider, profile);
        } catch (err) {
          if (err instanceof IdentityConflictError) {
            this.debugLog(
              `[oauth:${provider}] stage=link_conflict -> identity_conflict`,
            );
            return this.redirectWithAccountError(res, 'identity_conflict');
          }
          throw err;
        }

        // Rotate the session: same claims, fresh iat/exp, so any prior
        // copy of the cookie is superseded by this one going forward.
        const rotated = await this.sessions.signCitizenSession(currentSession);
        res.cookie(
          CITIZEN_SESSION_COOKIE,
          rotated,
          citizenCookieOptions(this.config, CITIZEN_SESSION_MAX_AGE_MS),
        );
        this.debugLog(`[oauth:${provider}] stage=linked ok`);
        return res.redirect(`${this.webOrigin()}/account?linked=${provider}`);
      }

      // purpose === 'reauth'
      const verified = await this.oauth.verifyProviderControl(
        consumed.citizenId,
        provider,
        profile,
      );
      if (!verified) {
        this.debugLog(
          `[oauth:${provider}] stage=reauth_mismatch -> reauth_failed`,
        );
        return this.redirectWithAccountError(res, 'reauth_failed');
      }
      const reauthToken = await this.sessions.signReauth(consumed.citizenId);
      res.cookie(
        CITIZEN_REAUTH_COOKIE,
        reauthToken,
        citizenCookieOptions(this.config, CITIZEN_REAUTH_MAX_AGE_MS),
      );
      this.debugLog(`[oauth:${provider}] stage=reauth ok`);
      return res.redirect(`${this.webOrigin()}/account?reauth=${provider}`);
    } catch (err) {
      this.debugLog(`[oauth:${provider}] stage=FAILED`, {
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof AccountLinkRequiredError) {
        return this.redirectWithLoginError(res, 'account_link_required');
      }
      if (err instanceof EmailRequiredError) {
        return this.redirectWithLoginError(res, 'email_required');
      }
      // Never surface the underlying reason (provider/network failure,
      // token verification failure) to the client.
      return consumed.purpose === 'login'
        ? this.redirectWithLoginError(res, 'oauth_failed')
        : this.redirectWithAccountError(res, 'oauth_failed');
    }
  }

  private redirectWithLoginError(res: Response, code: LoginErrorCode) {
    res.redirect(`${this.webOrigin()}/login?error=${code}`);
  }

  private redirectWithAccountError(res: Response, code: AccountErrorCode) {
    res.redirect(`${this.webOrigin()}/account?error=${code}`);
  }
}
