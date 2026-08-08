import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins } from '../db/schema';
import type { AdminSession } from '../auth/session.service';
import { AdminAuditService } from './admin-audit.service';

export type AdminRole = 'officer' | 'supervisor' | 'system_admin';
export type AdminOffice = 'MEO' | 'MDRRMO';
const ADMIN_ROLES: AdminRole[] = ['officer', 'supervisor', 'system_admin'];

export interface AdminAccountRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRole;
  office: AdminOffice | null;
  created_at: Date;
  is_active: boolean;
}

const SAFE_COLUMNS = {
  id: admins.id,
  first_name: admins.firstName,
  last_name: admins.lastName,
  email: admins.email,
  role: admins.role,
  office: admins.office,
  created_at: admins.createdAt,
  is_active: admins.isActive,
};

// Shared by create and update — an admin's role and office must always
// agree: system_admin implies no office, officer/supervisor implies exactly
// one. There is no "clamp" here (unlike ticket/report office scoping) —
// an invalid combination is always a hard rejection.
function assertRoleOfficeCombination(
  role: unknown,
  office: unknown,
): { role: AdminRole; office: AdminOffice | null } {
  if (typeof role !== 'string' || !ADMIN_ROLES.includes(role as AdminRole)) {
    throw new BadRequestException(
      'role must be officer, supervisor, or system_admin.',
    );
  }
  if (role === 'system_admin') {
    if (office !== null && office !== undefined) {
      throw new BadRequestException('system_admin must not have an office.');
    }
    return { role, office: null };
  }
  if (office !== 'MEO' && office !== 'MDRRMO') {
    throw new BadRequestException(
      'office must be MEO or MDRRMO for officer/supervisor.',
    );
  }
  return { role: role as AdminRole, office };
}

@Injectable()
export class AdminsService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly audit: AdminAuditService,
  ) {}

  async list(): Promise<AdminAccountRow[]> {
    return this.db
      .select(SAFE_COLUMNS)
      .from(admins)
      .orderBy(desc(admins.createdAt)) as Promise<AdminAccountRow[]>;
  }

  async create(
    input: {
      email: unknown;
      password: unknown;
      firstName: unknown;
      lastName: unknown;
      role: unknown;
      office: unknown;
    },
    actor: AdminSession,
  ): Promise<AdminAccountRow> {
    const { email, password, firstName, lastName } = input;
    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof firstName !== 'string' ||
      !firstName.trim() ||
      typeof lastName !== 'string' ||
      !lastName.trim()
    ) {
      throw new BadRequestException(
        'email, firstName, and lastName are required.',
      );
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException(
        'password must be at least 8 characters.',
      );
    }
    const { role, office } = assertRoleOfficeCombination(
      input.role,
      input.office,
    );

    const [existing] = await this.db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.email, email));
    if (existing) {
      throw new ConflictException('An admin with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Audit insert shares the transaction with the account creation itself
    // — if the audit write fails, account creation rolls back with it
    // rather than leaving an untracked admin account behind (see
    // admin-audit.service.ts for why the audit trail is load-bearing here).
    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(admins)
        .values({ email, passwordHash, firstName, lastName, role, office })
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: {
          adminId: actor.adminId,
          adminName: actor.adminName,
          email: actor.email,
          role: actor.role,
          office: actor.office,
        },
        actionType: 'admin_created',
        targetType: 'admin',
        targetId: created.id,
        targetSummary: `${created.first_name} ${created.last_name} <${created.email}>`,
        metadata: { role: created.role, office: created.office },
      });
      return created;
    });
    return row as AdminAccountRow;
  }

  async update(
    id: number,
    input: { role: unknown; office: unknown },
    actor: AdminSession,
  ): Promise<AdminAccountRow> {
    const [existing] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.id, id));
    if (!existing) throw new NotFoundException('Admin not found.');

    const { role, office } = assertRoleOfficeCombination(
      input.role,
      input.office,
    );

    // Prevent locking every system admin out: only blocks the transition
    // when this row is currently the last system_admin and the change
    // would move it to officer/supervisor. Changing an already
    // officer/supervisor row, or a system_admin staying system_admin, is
    // unaffected.
    if (existing.role === 'system_admin' && role !== 'system_admin') {
      const [{ systemAdminCount }] = await this.db
        .select({ systemAdminCount: count() })
        .from(admins)
        .where(eq(admins.role, 'system_admin'));
      if (systemAdminCount <= 1) {
        throw new ConflictException(
          'Cannot remove the last System Administrator.',
        );
      }
    }

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(admins)
        .set({ role, office })
        .where(eq(admins.id, id))
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: {
          adminId: actor.adminId,
          adminName: actor.adminName,
          email: actor.email,
          role: actor.role,
          office: actor.office,
        },
        actionType: 'admin_role_updated',
        targetType: 'admin',
        targetId: updated.id,
        targetSummary: `${updated.first_name} ${updated.last_name} <${updated.email}>`,
        metadata: {
          from: { role: existing.role, office: existing.office },
          to: { role: updated.role, office: updated.office },
        },
      });
      return updated;
    });
    return row as AdminAccountRow;
  }

  // Deactivation/reactivation. Mirrors update()'s last-system_admin lockout
  // above, scoped to *active* system admins — losing login access is
  // functionally equivalent to losing the role, so removing the last active
  // system_admin must be blocked here too (this also covers a system_admin
  // deactivating themselves when they're the only one left, since they're
  // still counted as active at the time of this check).
  async setActive(
    id: number,
    active: boolean,
    actor: AdminSession,
  ): Promise<AdminAccountRow> {
    const [existing] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.id, id));
    if (!existing) throw new NotFoundException('Admin not found.');

    if (existing.role === 'system_admin' && !active) {
      const [{ systemAdminCount }] = await this.db
        .select({ systemAdminCount: count() })
        .from(admins)
        .where(
          and(eq(admins.role, 'system_admin'), eq(admins.isActive, true)),
        );
      if (systemAdminCount <= 1) {
        throw new ConflictException(
          'Cannot deactivate the last active System Administrator.',
        );
      }
    }

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(admins)
        // Deactivation also bumps session_valid_after so an already-issued
        // JWT dies immediately (see SessionService.verifyAdminSession)
        // rather than surviving until its 8h expiry. Reactivation leaves it
        // untouched — a fresh login is all that's required.
        .set(
          active
            ? { isActive: true }
            : { isActive: false, sessionValidAfter: new Date() },
        )
        .where(eq(admins.id, id))
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: {
          adminId: actor.adminId,
          adminName: actor.adminName,
          email: actor.email,
          role: actor.role,
          office: actor.office,
        },
        actionType: active ? 'admin_reactivated' : 'admin_deactivated',
        targetType: 'admin',
        targetId: updated.id,
        targetSummary: `${updated.first_name} ${updated.last_name} <${updated.email}>`,
        metadata: {
          from: { active: existing.isActive },
          to: { active },
        },
      });
      return updated;
    });
    return row as AdminAccountRow;
  }
}
