import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env';
import type { EmailService } from './email.service';
import {
  oauthOnlyNoticeEmailHtml,
  passwordResetConfirmationEmailHtml,
  passwordResetEmailHtml,
} from './email-templates';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

// Production email delivery via Resend. Never throws — a provider outage
// must not fail the caller (POST /citizens/forgot-password's generic
// response, and resetPassword's own best-effort confirmation email, both
// depend on that). Failures are logged with only a masked recipient and
// the provider's error name/message, never the reset URL/token or the
// full email body — the same no-secrets convention already used by
// ConsoleEmailService and oauth.controller.ts's debugLog.
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly client: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }
    const from = config.get('EMAIL_FROM', { infer: true });
    if (!from) {
      throw new Error('EMAIL_FROM is not configured.');
    }
    this.client = new Resend(apiKey);
    this.from = from;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      const result = await this.client.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (result.error) {
        console.error('[email] Resend send failed', {
          email: maskEmail(to),
          errorName: result.error.name,
        });
        return;
      }
      // The message ID isn't sensitive (no token/URL/content in it) and is
      // useful for confirming delivery against the Resend dashboard.
      console.log('[email] Resend send accepted', {
        email: maskEmail(to),
        id: result.data.id,
      });
    } catch (err) {
      console.error('[email] Resend send threw', {
        email: maskEmail(to),
        errorMessage: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const ttlMinutes = this.config.get('RESET_TOKEN_TTL_MINUTES', {
      infer: true,
    });
    await this.send(
      email,
      'Reset your PORAC-SDSS password',
      passwordResetEmailHtml(resetUrl, ttlMinutes),
    );
  }

  async sendOAuthOnlyNotice(email: string): Promise<void> {
    await this.send(
      email,
      'Password reset requested — PORAC-SDSS',
      oauthOnlyNoticeEmailHtml(),
    );
  }

  async sendPasswordResetConfirmation(email: string): Promise<void> {
    await this.send(
      email,
      'Your PORAC-SDSS password was changed',
      passwordResetConfirmationEmailHtml(),
    );
  }
}
