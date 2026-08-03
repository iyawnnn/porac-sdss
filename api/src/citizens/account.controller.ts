import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { RecentReauthGuard } from '../common/guards/recent-reauth.guard';
import { CurrentCitizen } from '../common/decorators/current-citizen.decorator';
import {
  CITIZEN_REAUTH_COOKIE,
  CITIZEN_SESSION_COOKIE,
  SessionService,
  type CitizenSession,
} from '../auth/session.service';
import {
  citizenCookieOptions,
  CITIZEN_REAUTH_MAX_AGE_MS,
  CITIZEN_SESSION_MAX_AGE_MS,
} from '../auth/citizen-cookie.util';
import {
  AccountService,
  FinalLoginMethodError,
  NotLinkedError,
  ReauthRequiredError,
  WeakPasswordError,
  WrongPasswordError,
} from './account.service';

interface ReauthBody {
  currentPassword?: unknown;
}

interface PasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

@Controller('citizens/account')
@UseGuards(CitizenSessionGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('security')
  async security(@CurrentCitizen() citizen: CitizenSession) {
    return this.account.getSecurityStatus(citizen.citizenId);
  }

  // Password-based reauth: proves "it's really you, recently" for citizens
  // who have a password, unlocking unlink / first-time password setup the
  // same way a fresh provider round-trip does (see oauth.controller.ts's
  // mode=reauth).
  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  async reauth(
    @CurrentCitizen() citizen: CitizenSession,
    @Body() body: ReauthBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      typeof body.currentPassword !== 'string' ||
      body.currentPassword.length === 0
    ) {
      throw new BadRequestException('currentPassword is required.');
    }
    const ok = await this.account.verifyCurrentPassword(
      citizen.citizenId,
      body.currentPassword,
    );
    if (!ok) throw new UnauthorizedException('Incorrect password.');

    const token = await this.sessions.signReauth(citizen.citizenId);
    res.cookie(
      CITIZEN_REAUTH_COOKIE,
      token,
      citizenCookieOptions(this.config, CITIZEN_REAUTH_MAX_AGE_MS),
    );
    return { ok: true };
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Req() req: Request,
    @CurrentCitizen() citizen: CitizenSession,
    @Body() body: PasswordBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (typeof body.newPassword !== 'string') {
      throw new BadRequestException('newPassword is required.');
    }
    const currentPassword =
      typeof body.currentPassword === 'string'
        ? body.currentPassword
        : undefined;

    const reauthToken = req.cookies?.[CITIZEN_REAUTH_COOKIE] as
      string | undefined;
    const reauth = reauthToken
      ? await this.sessions.verifyReauth(reauthToken)
      : null;
    const hasFreshReauth = reauth?.citizenId === citizen.citizenId;

    try {
      await this.account.setOrChangePassword(
        citizen.citizenId,
        { currentPassword, newPassword: body.newPassword },
        hasFreshReauth,
      );
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
      if (err instanceof WeakPasswordError) {
        throw new BadRequestException(
          'Password must be at least 8 characters.',
        );
      }
      if (err instanceof ReauthRequiredError) {
        throw new HttpException(
          'Recent reauthentication required.',
          HttpStatus.PRECONDITION_REQUIRED,
        );
      }
      throw err;
    }

    await this.rotateSession(citizen, res);
    return { ok: true };
  }

  // RecentReauthGuard (method-level, on top of the class-level
  // CitizenSessionGuard) enforces "recent reauthentication" here
  // unconditionally — unlike password changes, there's no inline
  // credential in the request body that could double as proof.
  @Delete('identities/:provider')
  @UseGuards(RecentReauthGuard)
  @HttpCode(HttpStatus.OK)
  async unlink(
    @Param('provider') providerParam: string,
    @CurrentCitizen() citizen: CitizenSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (providerParam !== 'google') {
      throw new BadRequestException('Unknown provider.');
    }

    try {
      await this.account.unlinkProvider(citizen.citizenId, providerParam);
    } catch (err) {
      if (err instanceof NotLinkedError) {
        throw new BadRequestException(
          'That provider is not linked to your account.',
        );
      }
      if (err instanceof FinalLoginMethodError) {
        throw new BadRequestException(
          'You cannot remove your last login method. Set a password or link another provider first.',
        );
      }
      throw err;
    }

    await this.rotateSession(citizen, res);
    return { ok: true };
  }

  private async rotateSession(citizen: CitizenSession, res: Response) {
    const rotated = await this.sessions.signCitizenSession(citizen);
    res.cookie(
      CITIZEN_SESSION_COOKIE,
      rotated,
      citizenCookieOptions(this.config, CITIZEN_SESSION_MAX_AGE_MS),
    );
  }
}
