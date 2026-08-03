import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { citizens, passwordResetTokens } from '../db/schema';
import { RateLimitService } from '../domain/ratelimit.service';
import { logCitizenAuditEvent } from './citizen-audit';
import { normalizeEmail } from '../common/utils/normalize-email';
import { EMAIL_SERVICE, type EmailService } from './email.service';
import type { Env } from '../config/env';

export class PasswordResetRateLimitedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
export class TokenNotFoundError extends Error {}
export class TokenExpiredError extends Error {}
export class TokenUsedError extends Error {}
export class WeakPasswordError extends Error {}

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
// 48 random bytes -> 384 bits of entropy before hashing, well beyond
// brute-force range even accounting for the rate limits above.
const TOKEN_BYTES = 48;
// Used tokens are kept (not deleted) for this long after use purely so the
// cron cleanup job's own tests / audit correlation have something to look
// at — cleanupExpiredTokens() is what actually prunes them.
const USED_TOKEN_RETENTION_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly rateLimit: RateLimitService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Never throws for "email doesn't exist" — the caller (controller)
  // always returns the same 200 response regardless of what happens here,
  // so there's nothing to distinguish from the outside. Only throws for
  // rate-limit rejection, which is safe to surface distinctly (it reveals
  // nothing about whether a *specific* email has an account).
  async requestReset(email: string, ip: string): Promise<void> {
    const normalized = normalizeEmail(email);

    const rateLimitResult = await this.rateLimit.checkPasswordResetRateLimit(
      ip,
      normalized,
    );
    if (!rateLimitResult.allowed) {
      throw new PasswordResetRateLimitedError(
        rateLimitResult.reason ?? 'Too many requests.',
      );
    }
    // Recorded even for emails that don't exist below — otherwise probing
    // many addresses would never count against the email-hourly limit.
    await this.rateLimit.recordPasswordResetAttempt(ip, normalized);

    const [citizen] = await this.db
      .select({
        id: citizens.id,
        email: citizens.email,
        passwordHash: citizens.passwordHash,
      })
      .from(citizens)
      .where(eq(citizens.email, normalized));
    if (!citizen) return;

    if (!citizen.passwordHash) {
      await this.email.sendOAuthOnlyNotice(citizen.email);
      return;
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const ttlMinutes = this.config.get('RESET_TOKEN_TTL_MINUTES', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.db.insert(passwordResetTokens).values({
      citizenId: citizen.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    if (!webOrigin) throw new Error('WEB_ORIGIN is not configured.');
    const resetUrl = `${webOrigin}/reset-password?token=${token}`;
    await this.email.sendPasswordReset(citizen.email, resetUrl);
  }

  // Read-only — does not consume the token, so the frontend can show
  // "link invalid/expired" before the user even types a new password.
  async validateToken(token: string): Promise<boolean> {
    const row = await this.findActiveToken(token);
    return row !== null;
  }

  private async findActiveToken(token: string) {
    const [row] = await this.db
      .select({
        id: passwordResetTokens.id,
        citizenId: passwordResetTokens.citizenId,
        usedAt: passwordResetTokens.usedAt,
        expiresAt: passwordResetTokens.expiresAt,
        email: citizens.email,
      })
      .from(passwordResetTokens)
      .innerJoin(citizens, eq(passwordResetTokens.citizenId, citizens.id))
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)));

    if (!row) return null;
    if (row.usedAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  // Hashes+stores the new password, marks the token used, bumps
  // session_valid_after (the one lever that actually invalidates every
  // existing session for this citizen — see SessionService), and audits
  // the change — all in one transaction. Never issues a session cookie:
  // the citizen must log in again with the new password. A best-effort
  // confirmation email follows outside the transaction; its failure must
  // not undo or fail the reset itself.
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError();
    }

    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select({
        id: passwordResetTokens.id,
        citizenId: passwordResetTokens.citizenId,
        usedAt: passwordResetTokens.usedAt,
        expiresAt: passwordResetTokens.expiresAt,
        email: citizens.email,
      })
      .from(passwordResetTokens)
      .innerJoin(citizens, eq(passwordResetTokens.citizenId, citizens.id))
      .where(eq(passwordResetTokens.tokenHash, tokenHash));

    if (!row) throw new TokenNotFoundError();
    if (row.usedAt) throw new TokenUsedError();
    if (row.expiresAt.getTime() < Date.now()) throw new TokenExpiredError();

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(citizens)
        .set({
          passwordHash,
          passwordChangedAt: now,
          sessionValidAfter: now,
        })
        .where(eq(citizens.id, row.citizenId));

      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, row.id));
    });

    await logCitizenAuditEvent(this.db, row.citizenId, 'password_reset');

    try {
      await this.email.sendPasswordResetConfirmation(row.email);
    } catch {
      // Best-effort notification only — the reset itself already
      // succeeded and must not be rolled back or reported as failed.
    }
  }

  // Manual/on-demand trigger (POST /cron/cleanup-password-reset-tokens),
  // matching this codebase's other cron endpoints — nothing schedules it
  // yet. Deletes rows that can no longer matter: expired-and-unused, or
  // used long enough ago that audit correlation no longer needs them.
  async cleanupExpiredTokens(): Promise<void> {
    const cutoff = new Date(
      Date.now() - USED_TOKEN_RETENTION_DAYS * 86_400_000,
    );
    await this.db.execute(sql`
      DELETE FROM password_reset_tokens
      WHERE expires_at < now()
         OR (used_at IS NOT NULL AND used_at < ${cutoff})
    `);
  }
}
