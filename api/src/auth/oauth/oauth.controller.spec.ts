import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { OAuthController } from './oauth.controller';
import { OAuthStateService } from '../oauth-state.service';
import { SessionService } from '../session.service';
import { GoogleOAuthProvider } from './google-oauth.provider';
import { FacebookOAuthProvider } from './facebook-oauth.provider';
import { IdentityConflictError, OAuthService } from './oauth.service';
import type { Env } from '../../config/env';

const citizenSession = {
  citizenId: 1,
  email: 'citizen@example.com',
  citizenName: 'Citizen Name',
};
const profile = {
  subject: 'google-sub-1',
  email: 'citizen@example.com',
  firstName: 'A',
  lastName: 'B',
};

function makeConfig(): ConfigService<Env, true> {
  const values: Record<string, string> = {
    WEB_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'test',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

function makeRes() {
  const cookie = jest.fn();
  const redirect = jest.fn();
  const res = { cookie, redirect } as unknown as Response;
  return { res, cookie, redirect };
}

function makeReq(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

function makeController(overrides: {
  consume: jest.Mock;
  verifyCitizenSession?: jest.Mock;
  signCitizenSession?: jest.Mock;
  signReauth?: jest.Mock;
  linkIdentity?: jest.Mock;
  verifyProviderControl?: jest.Mock;
  loginOrCreate?: jest.Mock;
}) {
  const state = { consume: overrides.consume } as unknown as OAuthStateService;
  const verifyCitizenSession =
    overrides.verifyCitizenSession ??
    jest.fn().mockResolvedValue(citizenSession);
  const signCitizenSession =
    overrides.signCitizenSession ??
    jest.fn().mockResolvedValue('rotated-token');
  const signReauth =
    overrides.signReauth ?? jest.fn().mockResolvedValue('reauth-token');
  const sessions = {
    verifyCitizenSession,
    signCitizenSession,
    signReauth,
  } as unknown as SessionService;
  const google = {
    authorizeUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    resolveProfile: jest.fn().mockResolvedValue(profile),
  } as unknown as GoogleOAuthProvider;
  const facebook = {} as unknown as FacebookOAuthProvider;
  const linkIdentity =
    overrides.linkIdentity ?? jest.fn().mockResolvedValue(undefined);
  const verifyProviderControl =
    overrides.verifyProviderControl ?? jest.fn().mockResolvedValue(true);
  const loginOrCreate = overrides.loginOrCreate ?? jest.fn();
  const oauth = {
    loginOrCreate,
    linkIdentity,
    verifyProviderControl,
  } as unknown as OAuthService;

  const controller = new OAuthController(
    makeConfig(),
    state,
    sessions,
    google,
    facebook,
    oauth,
  );
  return {
    controller,
    verifyCitizenSession,
    signCitizenSession,
    signReauth,
    linkIdentity,
    verifyProviderControl,
    loginOrCreate,
  };
}

describe('OAuthController callback — link purpose', () => {
  it('links the identity, rotates the session, and redirects to /account?linked=<provider>', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'link', citizenId: 1 });
    const { controller, signCitizenSession, linkIdentity } = makeController({
      consume,
    });
    const { res, cookie, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({ ac_citizen_session: 'valid' }),
      res,
      'code',
      'state',
      undefined,
    );

    expect(linkIdentity).toHaveBeenCalledWith(1, 'google', profile);
    expect(signCitizenSession).toHaveBeenCalledWith(citizenSession);
    expect(cookie).toHaveBeenCalledWith(
      'ac_citizen_session',
      'rotated-token',
      expect.any(Object),
    );
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/account?linked=google',
    );
  });

  it('redirects to /account?error=identity_conflict without rotating the session on conflict', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'link', citizenId: 1 });
    const { controller, signCitizenSession } = makeController({
      consume,
      linkIdentity: jest.fn().mockRejectedValue(new IdentityConflictError()),
    });
    const { res, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({ ac_citizen_session: 'valid' }),
      res,
      'code',
      'state',
      undefined,
    );

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/account?error=identity_conflict',
    );
    expect(signCitizenSession).not.toHaveBeenCalled();
  });

  it('refuses to link when the current session cookie belongs to a different citizen than the state was issued for', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'link', citizenId: 999 });
    const { controller, linkIdentity } = makeController({ consume });
    const { res, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({ ac_citizen_session: 'valid' }),
      res,
      'code',
      'state',
      undefined,
    );

    expect(linkIdentity).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/account?error=oauth_failed',
    );
  });
});

describe('OAuthController callback — reauth purpose', () => {
  it('sets the reauth cookie and redirects to /account?reauth=<provider> on a matching subject', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'reauth', citizenId: 1 });
    const { controller, signReauth } = makeController({ consume });
    const { res, cookie, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({ ac_citizen_session: 'valid' }),
      res,
      'code',
      'state',
      undefined,
    );

    expect(signReauth).toHaveBeenCalledWith(1);
    expect(cookie).toHaveBeenCalledWith(
      'ac_citizen_reauth',
      'reauth-token',
      expect.any(Object),
    );
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/account?reauth=google',
    );
  });

  it('redirects to /account?error=reauth_failed when the resolved subject does not match', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'reauth', citizenId: 1 });
    const { controller, signReauth } = makeController({
      consume,
      verifyProviderControl: jest.fn().mockResolvedValue(false),
    });
    const { res, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({ ac_citizen_session: 'valid' }),
      res,
      'code',
      'state',
      undefined,
    );

    expect(signReauth).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3000/account?error=reauth_failed',
    );
  });
});

describe('OAuthController callback — login purpose regression', () => {
  it('still logs in and redirects to /dashboard, never touching link/reauth cookies', async () => {
    const consume = jest
      .fn()
      .mockResolvedValue({ purpose: 'login', citizenId: undefined });
    const { controller, loginOrCreate, signReauth } = makeController({
      consume,
      verifyCitizenSession: jest.fn(),
      loginOrCreate: jest.fn().mockResolvedValue({ token: 'session-token' }),
    });
    const { res, cookie, redirect } = makeRes();

    await controller.googleCallback(
      makeReq({}),
      res,
      'code',
      'state',
      undefined,
    );

    expect(loginOrCreate).toHaveBeenCalledWith('google', profile);
    expect(cookie).toHaveBeenCalledWith(
      'ac_citizen_session',
      'session-token',
      expect.any(Object),
    );
    expect(redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    expect(signReauth).not.toHaveBeenCalled();
  });
});

describe('OAuthController start — mode=link/reauth requires an authenticated citizen', () => {
  it('redirects unauthenticated mode=link requests to /login instead of issuing state', async () => {
    const consume = jest.fn();
    const { controller } = makeController({
      consume,
      verifyCitizenSession: jest.fn().mockResolvedValue(null),
    });
    const { res, redirect } = makeRes();

    await controller.googleStart(makeReq({}), res, 'link');

    expect(redirect).toHaveBeenCalledWith('http://localhost:3000/login');
  });
});
