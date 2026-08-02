import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

// DI token — EmailService is an interface (erased at runtime), so
// consumers inject by this token rather than the type itself.
export const EMAIL_SERVICE = 'EMAIL_SERVICE';

// One method per email this feature sends. Wiring a real provider
// (Resend/SendGrid/SMTP/etc.) later means implementing this interface
// once — the security logic (token generation, hashing, rate limiting)
// never needs to change alongside it.
export interface EmailService {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
  sendOAuthOnlyNotice(email: string): Promise<void>;
  sendPasswordResetConfirmation(email: string): Promise<void>;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

// Default implementation until a real provider is wired: logs that an
// email *would* be sent, dev/test only, and never the token, reset URL,
// or a full email address/body — matching the no-secrets debugLog
// convention already used in auth/oauth/oauth.controller.ts.
@Injectable()
export class ConsoleEmailService implements EmailService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private log(message: string, email: string) {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') return;
    console.log(`[email] ${message}`, { email: maskEmail(email) });
  }

  sendPasswordReset(email: string): Promise<void> {
    this.log('password reset link sent', email);
    return Promise.resolve();
  }

  sendOAuthOnlyNotice(email: string): Promise<void> {
    this.log('oauth-only account notice sent (no password to reset)', email);
    return Promise.resolve();
  }

  sendPasswordResetConfirmation(email: string): Promise<void> {
    this.log('password reset confirmation sent', email);
    return Promise.resolve();
  }
}
