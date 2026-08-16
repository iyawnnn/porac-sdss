import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { DomainModule } from '../domain/domain.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import {
  ConsoleEmailService,
  EMAIL_SERVICE,
  type EmailService,
} from './email.service';
import { ResendEmailService } from './resend-email.service';
import type { Env } from '../config/env';

// Extracted so the selection logic is unit-testable without bootstrapping
// Nest's DI container. Real delivery once RESEND_API_KEY is configured;
// ConsoleEmailService (dev/test fallback, logs a masked confirmation,
// never sends) otherwise — an explicit fallback, not a silent no-op.
export function createEmailService(
  config: ConfigService<Env, true>,
): EmailService {
  if (config.get('RESEND_API_KEY', { infer: true })) {
    console.log('[email] Resend email service active — real email will be sent.');
    return new ResendEmailService(config);
  }
  console.log(
    '[email] Console email service active — no real email will be sent (development/test fallback).',
  );
  return new ConsoleEmailService(config);
}

@Module({
  imports: [AuthModule, DomainModule],
  controllers: [AccountController, PasswordResetController],
  providers: [
    AccountService,
    PasswordResetService,
    {
      provide: EMAIL_SERVICE,
      inject: [ConfigService],
      useFactory: createEmailService,
    },
  ],
  exports: [PasswordResetService, EMAIL_SERVICE],
})
export class CitizensModule {}
