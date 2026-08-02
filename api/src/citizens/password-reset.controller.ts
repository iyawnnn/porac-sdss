import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  PasswordResetRateLimitedError,
  PasswordResetService,
  TokenExpiredError,
  TokenNotFoundError,
  TokenUsedError,
  WeakPasswordError,
} from './password-reset.service';

interface ForgotPasswordBody {
  email?: unknown;
}

interface ResetPasswordBody {
  token?: unknown;
  newPassword?: unknown;
}

// x-forwarded-for's first hop — main.ts sets `trust proxy` since all
// traffic arrives one hop away via Next's rewrite proxy (same helper shape
// as reports.controller.ts's getClientIp).
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return value.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}

@Controller('citizens')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  // Always 200 { ok: true } regardless of whether the email exists —
  // enumeration resistance. Rate-limit rejection is the one thing allowed
  // to respond differently (429): it reveals request volume, not whether
  // any specific email has an account.
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Req() req: Request, @Body() body: ForgotPasswordBody) {
    if (typeof body.email !== 'string' || body.email.length === 0) {
      throw new BadRequestException('email is required.');
    }

    try {
      await this.passwordReset.requestReset(body.email, getClientIp(req));
    } catch (err) {
      if (err instanceof PasswordResetRateLimitedError) {
        throw new HttpException(err.reason, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw err;
    }

    return { ok: true };
  }

  @Get('reset-password/validate')
  async validateResetToken(@Query('token') token?: string) {
    if (typeof token !== 'string' || token.length === 0) {
      return { valid: false };
    }
    const valid = await this.passwordReset.validateToken(token);
    return { valid };
  }

  // Never issues a session cookie — the citizen logs in again with the new
  // password. session_valid_after is bumped inside the service, so any
  // session issued before this reset stops working on its next request.
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordBody) {
    if (typeof body.token !== 'string' || body.token.length === 0) {
      throw new BadRequestException('token is required.');
    }
    if (typeof body.newPassword !== 'string') {
      throw new BadRequestException('newPassword is required.');
    }

    try {
      await this.passwordReset.resetPassword(body.token, body.newPassword);
    } catch (err) {
      if (err instanceof TokenNotFoundError) {
        throw new BadRequestException('invalid_token');
      }
      if (err instanceof TokenExpiredError) {
        throw new BadRequestException('expired_token');
      }
      if (err instanceof TokenUsedError) {
        throw new BadRequestException('token_used');
      }
      if (err instanceof WeakPasswordError) {
        throw new BadRequestException('weak_password');
      }
      throw err;
    }

    return { ok: true };
  }
}
