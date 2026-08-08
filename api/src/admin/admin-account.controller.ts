import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import {
  SESSION_COOKIE,
  SessionService,
  type AdminSession,
} from '../auth/session.service';
import { adminCookieOptions, ADMIN_SESSION_MAX_AGE_MS } from '../auth/admin-cookie.util';
import type { Env } from '../config/env';
import {
  AdminAccountService,
  WeakPasswordError,
  WrongPasswordError,
} from './admin-account.service';

interface PasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

// Any logged-in admin (officer/supervisor/system_admin) can reach this —
// deliberately not SystemAdminGuard'd, unlike AdminsController. Changing
// your own password requires no special role, only proof of the current
// one.
@Controller('admin/account')
@UseGuards(AdminSessionGuard)
export class AdminAccountController {
  constructor(
    private readonly account: AdminAccountService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAdmin() actor: AdminSession,
    @Body() body: PasswordBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      await this.account.changeOwnPassword(actor, {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
      if (err instanceof WeakPasswordError) {
        throw new BadRequestException(
          'Password must be at least 8 characters.',
        );
      }
      throw err;
    }

    // The change just bumped session_valid_after to now(), which would
    // reject this very request's own cookie on its next verification —
    // rotate it immediately so the admin who just changed their password
    // stays signed in (mirrors citizens/account.controller.ts's
    // rotateSession). Every *other* session for this admin stays rejected.
    const rotated = await this.sessions.signAdminSession(actor);
    res.cookie(
      SESSION_COOKIE,
      rotated,
      adminCookieOptions(this.config, ADMIN_SESSION_MAX_AGE_MS),
    );
    return { ok: true };
  }
}
