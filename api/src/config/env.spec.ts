import { validate } from './env';

// Every required field, valid, so a single test can knock out exactly one
// field at a time without tripping unrelated validation failures.
function validRawEnv(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/porac',
    JWT_SECRET: 'a'.repeat(32),
    CLOUDINARY_URL: 'cloudinary://key:secret@cloud-name',
    OPENWEATHERMAP_API_KEY: 'weather-key',
    CRON_SECRET: 'b'.repeat(16),
    ...overrides,
  };
}

describe('validate — missing DATABASE_URL', () => {
  it('names the field, points at api/.env, and does not leak any other field value', () => {
    const raw = validRawEnv({ DATABASE_URL: undefined });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('api/.env');
    expect(message).toMatch(/api\/\.env\.example|README/);
    expect(message).not.toContain(raw.CLOUDINARY_URL);
    expect(message).not.toContain(raw.OPENWEATHERMAP_API_KEY);
  });
});

describe('validate — short JWT_SECRET', () => {
  it('includes the frontend/root cross-app matching note, and never echoes the supplied secret', () => {
    const raw = validRawEnv({ JWT_SECRET: 'short-secret' });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('JWT_SECRET');
    expect(message).toMatch(/root .env\.local/);
    expect(message).toMatch(/byte-identical/);
    expect(message).not.toContain('short-secret');
  });
});

describe('validate — malformed CLOUDINARY_URL', () => {
  it('names the field and never echoes the malformed value (which may embed credentials)', () => {
    const badUrl = 'postgres://someuser:somepassword@host/db';
    const raw = validRawEnv({ CLOUDINARY_URL: badUrl });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('CLOUDINARY_URL');
    expect(message).not.toContain(badUrl);
    expect(message).not.toContain('somepassword');
  });
});

describe('validate — missing CRON_SECRET', () => {
  it('names the field and points at api/.env (mirrors the DATABASE_URL case)', () => {
    const raw = validRawEnv({ CRON_SECRET: undefined });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('CRON_SECRET');
    expect(message).toContain('api/.env');
  });
});

describe('validate — valid env', () => {
  it('returns the parsed env without throwing', () => {
    const raw = validRawEnv();

    const result = validate(raw);

    expect(result.DATABASE_URL).toBe(raw.DATABASE_URL);
    expect(result.JWT_SECRET).toBe(raw.JWT_SECRET);
    expect(result.CLOUDINARY_URL).toBe(raw.CLOUDINARY_URL);
    expect(result.CRON_SECRET).toBe(raw.CRON_SECRET);
    // Defaults still apply as before — unchanged success-path behavior.
    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe('development');
  });
});

describe('validate — non-JWT failure', () => {
  it('does not show the JWT_SECRET matching note when JWT_SECRET itself is valid', () => {
    const raw = validRawEnv({ DATABASE_URL: undefined });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).not.toContain('JWT_SECRET');
    expect(message).not.toMatch(/byte-identical/);
  });
});

describe('validate — RESEND_API_KEY / EMAIL_FROM pairing (hardening item 7)', () => {
  it('fails with a message naming both variables when RESEND_API_KEY is set without EMAIL_FROM', () => {
    const raw = validRawEnv({ RESEND_API_KEY: 'resend-key' });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('RESEND_API_KEY');
    expect(message).toContain('EMAIL_FROM');
    expect(message).toMatch(/together/);
  });

  it('succeeds when both RESEND_API_KEY and EMAIL_FROM are set', () => {
    const raw = validRawEnv({
      RESEND_API_KEY: 'resend-key',
      EMAIL_FROM: 'noreply@example.com',
    });

    expect(() => validate(raw)).not.toThrow();
  });

  it('succeeds when neither RESEND_API_KEY nor EMAIL_FROM is set (ConsoleEmailService fallback)', () => {
    const raw = validRawEnv();

    expect(() => validate(raw)).not.toThrow();
  });

  it('succeeds when EMAIL_FROM is set without RESEND_API_KEY (harmless, unused)', () => {
    const raw = validRawEnv({ EMAIL_FROM: 'noreply@example.com' });

    expect(() => validate(raw)).not.toThrow();
  });

  it('does not disturb an unrelated failure (missing DATABASE_URL keeps its original shape)', () => {
    const raw = validRawEnv({ DATABASE_URL: undefined });

    let message = '';
    try {
      validate(raw);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('RESEND_API_KEY');
    expect(message).not.toContain('EMAIL_FROM');
  });
});
