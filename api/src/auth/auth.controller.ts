import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  CITIZEN_SESSION_COOKIE,
  SESSION_COOKIE,
  SessionService,
} from './session.service';
import {
  citizenCookieOptions,
  CITIZEN_SESSION_MAX_AGE_MS,
} from './citizen-cookie.util';
import { adminCookieOptions, ADMIN_SESSION_MAX_AGE_MS } from './admin-cookie.util';
import type { Env } from '../config/env';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface SignupBody extends LoginBody {
  firstName?: unknown;
  lastName?: unknown;
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, office } = await this.auth.adminLogin(
      body.email,
      body.password,
    );
    res.cookie(SESSION_COOKIE, token, adminCookieOptions(this.config, ADMIN_SESSION_MAX_AGE_MS));
    return { ok: true, office };
  }

  // No guard here deliberately — logout must succeed even with an expired
  // or already-invalid cookie (a guard would 401 before the handler runs,
  // leaving the stale cookie in place). Instead the token is verified
  // tolerantly: if it resolves to a real session, that session is
  // invalidated server-side (see SessionService.invalidateAdminSession);
  // either way the cookie is cleared exactly as before.
  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  async adminLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = token ? await this.sessions.verifyAdminSession(token) : null;
    if (session) await this.sessions.invalidateAdminSession(session.adminId);
    res.cookie(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return { ok: true };
  }

  @Post('citizens/login')
  @HttpCode(HttpStatus.OK)
  async citizenLogin(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.citizenLogin(body.email, body.password);
    res.cookie(
      CITIZEN_SESSION_COOKIE,
      token,
      citizenCookieOptions(this.config, CITIZEN_SESSION_MAX_AGE_MS),
    );
    return { ok: true };
  }

  @Post('citizens/signup')
  @HttpCode(HttpStatus.CREATED)
  async citizenSignup(
    @Body() body: SignupBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.citizenSignup(
      body.email,
      body.password,
      body.firstName,
      body.lastName,
    );
    res.cookie(
      CITIZEN_SESSION_COOKIE,
      token,
      citizenCookieOptions(this.config, CITIZEN_SESSION_MAX_AGE_MS),
    );
    return { ok: true };
  }

  // Same tolerant-verify pattern as adminLogout above.
  @Post('citizens/logout')
  @HttpCode(HttpStatus.OK)
  async citizenLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[CITIZEN_SESSION_COOKIE] as string | undefined;
    const session = token ? await this.sessions.verifyCitizenSession(token) : null;
    if (session) await this.sessions.invalidateCitizenSession(session.citizenId);
    res.cookie(CITIZEN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return { ok: true };
  }

  // Tries the admin cookie first, then the citizen cookie — needed by SSR
  // layouts (Phase 8) that today call getAdminSession()/getCitizenSession()
  // locally and don't know in advance which kind of session a given page
  // expects.
  @Get('auth/me')
  async me(@Req() req: Request) {
    const adminToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (adminToken) {
      const session = await this.sessions.verifyAdminSession(adminToken);
      if (session) return { type: 'admin' as const, session };
    }

    const citizenToken = req.cookies?.[CITIZEN_SESSION_COOKIE] as
      string | undefined;
    if (citizenToken) {
      const session = await this.sessions.verifyCitizenSession(citizenToken);
      if (session) return { type: 'citizen' as const, session };
    }

    throw new UnauthorizedException();
  }
}
