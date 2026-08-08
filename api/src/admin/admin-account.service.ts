import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins } from '../db/schema';
import type { AdminSession } from '../auth/session.service';
import { AdminAuditService } from './admin-audit.service';

export class WrongPasswordError extends Error {}
export class WeakPasswordError extends Error {}
// A System Admin resetting their own row through the "reset another
// admin's password" action would bypass the current-password check that
// changeOwnPassword requires — "change my password" is the only path for
// touching your own credentials, so this is rejected outright rather than
// silently allowed.
export class SelfResetNotAllowedError extends Error {}

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;

function actorSnapshot(actor: AdminSession) {
  return {
    adminId: actor.adminId,
    adminName: actor.adminName,
    email: actor.email,
    role: actor.role,
    office: actor.office,
  };
}

@Injectable()
export class AdminAccountService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly audit: AdminAuditService,
  ) {}

  // Every admin always has a password (unlike citizens, there are no
  // OAuth-only admin accounts) — verifying currentPassword *is* the reauth,
  // no separate reauth cookie/flow needed. Bumps session_valid_after so
  // every other session for this admin is invalidated; the caller is
  // responsible for reissuing a fresh cookie for the current request (see
  // admin-account.controller.ts).
  async changeOwnPassword(
    actor: AdminSession,
    input: { currentPassword: unknown; newPassword: unknown },
  ): Promise<void> {
    if (
      typeof input.newPassword !== 'string' ||
      input.newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      throw new WeakPasswordError();
    }
    if (typeof input.currentPassword !== 'string' || !input.currentPassword) {
      throw new WrongPasswordError();
    }

    const [row] = await this.db
      .select({ passwordHash: admins.passwordHash })
      .from(admins)
      .where(eq(admins.id, actor.adminId));
    if (!row || !(await bcrypt.compare(input.currentPassword, row.passwordHash))) {
      throw new WrongPasswordError();
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    // Audit insert shares the transaction with the password update itself
    // — see admin-audit.service.ts for why a failed audit write blocks the
    // action rather than silently going missing.
    await this.db.transaction(async (tx) => {
      await tx
        .update(admins)
        .set({ passwordHash, passwordChangedAt: now, sessionValidAfter: now })
        .where(eq(admins.id, actor.adminId));
      await this.audit.logInTx(tx, {
        actor: actorSnapshot(actor),
        actionType: 'admin_password_changed',
        targetType: 'admin',
        targetId: actor.adminId,
        targetSummary: `${actor.adminName} <${actor.email}>`,
      });
    });
  }

  // System Admin setting a temporary password for another admin. No
  // current-password check (the actor isn't the account owner) — access
  // control (system_admin only) is enforced by SystemAdminGuard on the
  // controller, not here. Bumps the *target's* session_valid_after; the
  // actor's own session is untouched since it's a different admin row.
  async resetPassword(
    actor: AdminSession,
    targetId: number,
    newPassword: unknown,
  ): Promise<void> {
    if (targetId === actor.adminId) {
      throw new SelfResetNotAllowedError();
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError();
    }

    const [target] = await this.db
      .select({
        id: admins.id,
        firstName: admins.firstName,
        lastName: admins.lastName,
        email: admins.email,
      })
      .from(admins)
      .where(eq(admins.id, targetId));
    if (!target) throw new NotFoundException('Admin not found.');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(admins)
        .set({ passwordHash, passwordChangedAt: now, sessionValidAfter: now })
        .where(eq(admins.id, targetId));
      // metadata is deliberately omitted — there is nothing about a
      // password reset that's safe to store beyond who/what/when, which
      // the actor/target/action_type columns already carry.
      await this.audit.logInTx(tx, {
        actor: actorSnapshot(actor),
        actionType: 'admin_password_reset',
        targetType: 'admin',
        targetId: target.id,
        targetSummary: `${target.firstName} ${target.lastName} <${target.email}>`,
      });
    });
  }
}
