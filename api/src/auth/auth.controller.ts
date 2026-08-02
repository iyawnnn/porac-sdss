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
import type { CookieOptions, Request, Response } from 'express';
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

  private cookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/',
      // Express's res.cookie maxAge is milliseconds, unlike Next's
      // cookies().set which took seconds — this is the one place that
      // conversion matters.
      maxAge: maxAgeSeconds * 1000,
    };
  }

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
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(8 * 60 * 60));
    return { ok: true, office };
  }

  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  adminLogout(@Res({ passthrough: true }) res: Response) {
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

  @Post('citizens/logout')
  @HttpCode(HttpStatus.OK)
  citizenLogout(@Res({ passthrough: true }) res: Response) {
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
