import { ConfigService } from '@nestjs/config';
import { createEmailService } from './citizens.module';
import { ConsoleEmailService } from './email.service';
import { ResendEmailService } from './resend-email.service';
import type { Env } from '../config/env';

function makeConfig(
  overrides: Record<string, unknown>,
): ConfigService<Env, true> {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

describe('createEmailService', () => {
  it('selects ResendEmailService when RESEND_API_KEY is configured', () => {
    const config = makeConfig({
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'onboarding@resend.dev',
    });
    expect(createEmailService(config)).toBeInstanceOf(ResendEmailService);
  });

  it('falls back to ConsoleEmailService when RESEND_API_KEY is not configured', () => {
    const config = makeConfig({});
    expect(createEmailService(config)).toBeInstanceOf(ConsoleEmailService);
  });
});
