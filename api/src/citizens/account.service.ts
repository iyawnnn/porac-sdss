import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { citizenIdentities, citizens } from '../db/schema';
import { logCitizenAuditEvent } from './citizen-audit';
import type { OAuthProvider } from '../auth/oauth-state.service';

export class WrongPasswordError extends Error {}
export class ReauthRequiredError extends Error {}
export class NotLinkedError extends Error {}
export class WeakPasswordError extends Error {}
// "Final login method" — a citizen must always be left with at least one
// way back in: a password, or at least one linked provider.
export class FinalLoginMethodError extends Error {}

export interface SecurityStatus {
  hasPassword: boolean;
  providers: { google: boolean; facebook: boolean };
}

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AccountService {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase) {}

  async getSecurityStatus(citizenId: number): Promise<SecurityStatus> {
    const [citizen] = await this.db
      .select({ passwordHash: citizens.passwordHash })
      .from(citizens)
      .where(eq(citizens.id, citizenId));
    const identities = await this.db
      .select({ provider: citizenIdentities.provider })
      .from(citizenIdentities)
      .where(eq(citizenIdentities.citizenId, citizenId));

    return {
      hasPassword: Boolean(citizen?.passwordHash),
      providers: {
        google: identities.some((i) => i.provider === 'google'),
        facebook: identities.some((i) => i.provider === 'facebook'),
      },
    };
  }

  async verifyCurrentPassword(
    citizenId: number,
    currentPassword: string,
  ): Promise<boolean> {
    const [citizen] = await this.db
      .select({ passwordHash: citizens.passwordHash })
      .from(citizens)
      .where(eq(citizens.id, citizenId));
    if (!citizen?.passwordHash) return false;
    return bcrypt.compare(currentPassword, citizen.passwordHash);
  }

  // Existing password: currentPassword must verify (that check *is* the
  // reauth — no separate cookie needed). No password yet (OAuth-only):
  // hasFreshReauth must be true (a recent /citizens/account/reauth call or
  // provider round-trip) — never bypassed by anything supplied in the body.
  async setOrChangePassword(
    citizenId: number,
    input: { currentPassword?: string; newPassword: string },
    hasFreshReauth: boolean,
  ): Promise<void> {
    if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError();
    }

    const [citizen] = await this.db
      .select({ passwordHash: citizens.passwordHash })
      .from(citizens)
      .where(eq(citizens.id, citizenId));

    let eventType: 'password_set' | 'password_changed';
    if (citizen?.passwordHash) {
      if (
        !input.currentPassword ||
        !(await bcrypt.compare(input.currentPassword, citizen.passwordHash))
      ) {
        throw new WrongPasswordError();
      }
      eventType = 'password_changed';
    } else {
      if (!hasFreshReauth) throw new ReauthRequiredError();
      eventType = 'password_set';
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.db
      .update(citizens)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(citizens.id, citizenId));

    await logCitizenAuditEvent(this.db, citizenId, eventType);
  }

  // RecentReauthGuard already confirmed a fresh reauth cookie before this
  // is reached — this only enforces the domain rule (never drop below one
  // usable login method) and performs the deletion transactionally.
  async unlinkProvider(
    citizenId: number,
    provider: OAuthProvider,
  ): Promise<void> {
    const [citizen] = await this.db
      .select({ passwordHash: citizens.passwordHash })
      .from(citizens)
      .where(eq(citizens.id, citizenId));
    const identities = await this.db
      .select({ provider: citizenIdentities.provider })
      .from(citizenIdentities)
      .where(eq(citizenIdentities.citizenId, citizenId));

    if (!identities.some((i) => i.provider === provider)) {
      throw new NotLinkedError();
    }

    const hasPassword = Boolean(citizen?.passwordHash);
    const remainingMethods = (hasPassword ? 1 : 0) + identities.length - 1;
    if (remainingMethods < 1) {
      throw new FinalLoginMethodError();
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(citizenIdentities)
        .where(
          and(
            eq(citizenIdentities.citizenId, citizenId),
            eq(citizenIdentities.provider, provider),
          ),
        );
    });

    await logCitizenAuditEvent(this.db, citizenId, 'provider_unlinked', {
      provider,
    });
  }
}
