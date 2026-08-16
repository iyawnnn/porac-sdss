import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env';
import type { EmailService } from './email.service';
import {
  oauthOnlyNoticeEmailHtml,
  passwordResetConfirmationEmailHtml,
  passwordResetEmailHtml,
  reportRejectedEmailHtml,
  reportResolvedEmailHtml,
} from './email-templates';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

// Resend's 'validation_error' code is a generic catch-all for many unrelated
// request-validation failures, not a dedicated "domain not verified" code —
// so status/name alone isn't a safe signal. Requiring the message substring
// too keeps this modest and specific: it only fires for the one message
// shape Resend actually uses for this case, and simply stays silent (never
// a false claim) if that wording ever changes.
function unverifiedDomainHint(error: {
  statusCode: number | null;
  name: string;
  message: string;
}): string | undefined {
  const looksLikeUnverifiedDomain =
    error.statusCode === 403 &&
    error.name === 'validation_error' &&
    /own email address|verify a domain/i.test(error.message);
  return looksLikeUnverifiedDomain
    ? 'Resend may be rejecting this address because the configured sending domain is not verified — see docs/deployment-readiness.md §5.'
    : undefined;
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
        const hint = unverifiedDomainHint(result.error);
        console.error('[email] RESEND SEND FAILED — no email was delivered', {
          email: maskEmail(to),
          errorName: result.error.name,
          statusCode: result.error.statusCode,
          ...(hint ? { hint } : {}),
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
      console.error('[email] RESEND SEND THREW — no email was delivered', {
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

  async sendReportResolved(email: string, reportUrl: string): Promise<void> {
    await this.send(
      email,
      'Your report was resolved — PORAC-SDSS',
      reportResolvedEmailHtml(reportUrl),
    );
  }

  async sendReportRejected(
    email: string,
    reportUrl: string,
    reason?: string,
  ): Promise<void> {
    await this.send(
      email,
      'Update on your report — PORAC-SDSS',
      reportRejectedEmailHtml(reportUrl, reason),
    );
  }
}
