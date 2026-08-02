import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

const sendMock = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

// Imported after the mock so the constructor picks up the mocked client.
import { ResendEmailService } from './resend-email.service';

function makeConfig(
  overrides?: Record<string, unknown>,
): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    RESEND_API_KEY: 'test-api-key',
    EMAIL_FROM: 'onboarding@resend.dev',
    WEB_ORIGIN: 'http://localhost:3000',
    RESET_TOKEN_TTL_MINUTES: 30,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<
    Env,
    true
  >;
}

describe('ResendEmailService construction', () => {
  it('throws if RESEND_API_KEY is not configured', () => {
    expect(
      () => new ResendEmailService(makeConfig({ RESEND_API_KEY: undefined })),
    ).toThrow('RESEND_API_KEY');
  });

  it('throws if EMAIL_FROM is not configured', () => {
    expect(
      () => new ResendEmailService(makeConfig({ EMAIL_FROM: undefined })),
    ).toThrow('EMAIL_FROM');
  });
});

describe('ResendEmailService.sendPasswordReset', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends a branded HTML email containing the reset URL, from the configured address', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const service = new ResendEmailService(makeConfig());

    await service.sendPasswordReset(
      'citizen@example.com',
      'http://localhost:3000/reset-password?token=abc',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload] = sendMock.mock.calls[0] as [
      { from: string; to: string; subject: string; html: string },
    ];
    expect(payload.from).toBe('onboarding@resend.dev');
    expect(payload.to).toBe('citizen@example.com');
    expect(payload.subject).toMatch(/reset/i);
    expect(payload.html).toContain(
      'http://localhost:3000/reset-password?token=abc',
    );
    expect(payload.html).toContain('PORAC-SDSS');
    expect(payload.html).toMatch(/didn't request this/i);
  });

  it('never throws when Resend returns a provider error, and logs no reset URL', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        message: 'invalid domain',
        statusCode: 403,
        name: 'validation_error',
      },
    });
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const service = new ResendEmailService(makeConfig());

    await expect(
      service.sendPasswordReset(
        'citizen@example.com',
        'http://localhost:3000/reset-password?token=SECRET',
      ),
    ).resolves.toBeUndefined();

    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('SECRET');
      expect(JSON.stringify(call)).not.toContain('citizen@example.com');
    }
    errorSpy.mockRestore();
  });

  it('never throws when the Resend client itself throws (network failure), and logs no reset URL', async () => {
    sendMock.mockRejectedValue(new Error('fetch failed'));
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const service = new ResendEmailService(makeConfig());

    await expect(
      service.sendPasswordReset(
        'citizen@example.com',
        'http://localhost:3000/reset-password?token=SECRET',
      ),
    ).resolves.toBeUndefined();

    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('SECRET');
    }
    errorSpy.mockRestore();
  });

  it('logs only a masked email and the message id on success, never the full address or content', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const service = new ResendEmailService(makeConfig());

    await service.sendPasswordReset(
      'citizen@example.com',
      'http://localhost:3000/reset-password?token=abc',
    );

    const [, meta] = logSpy.mock.calls[0] as [
      string,
      { email: string; id: string },
    ];
    expect(meta.email).toBe('c***@example.com');
    expect(meta.id).toBe('msg_123');
    logSpy.mockRestore();
  });
});

describe('ResendEmailService.sendOAuthOnlyNotice / sendPasswordResetConfirmation', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg_456' }, error: null });
  });

  it('sends the OAuth-only notice with no reset link', async () => {
    const service = new ResendEmailService(makeConfig());
    await service.sendOAuthOnlyNotice('oauth@example.com');

    const [payload] = sendMock.mock.calls[0] as [
      { to: string; subject: string; html: string },
    ];
    expect(payload.to).toBe('oauth@example.com');
    expect(payload.html).not.toContain('reset-password?token=');
  });

  it('sends the post-reset confirmation email', async () => {
    const service = new ResendEmailService(makeConfig());
    await service.sendPasswordResetConfirmation('citizen@example.com');

    const [payload] = sendMock.mock.calls[0] as [
      { to: string; subject: string },
    ];
    expect(payload.to).toBe('citizen@example.com');
    expect(payload.subject).toMatch(/changed/i);
  });
});
