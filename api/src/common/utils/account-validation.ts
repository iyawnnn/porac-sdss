import { z } from 'zod';

export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 100;
export const BCRYPT_PASSWORD_MAX_BYTES = 72;

export const isValidEmail = (email: string): boolean =>
  z.string().email().max(EMAIL_MAX_LENGTH).safeParse(email).success;

export const isValidPassword = (password: string): boolean =>
  password.length >= 8 &&
  Buffer.byteLength(password, 'utf8') <= BCRYPT_PASSWORD_MAX_BYTES;

// Drizzle wraps the postgres.js error, so the SQLSTATE may be on `cause`.
export const isUniqueViolation = (error: unknown): boolean =>
  [error, (error as { cause?: unknown } | null)?.cause].some(
    (e) => (e as { code?: unknown } | null)?.code === '23505',
  );
