import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins } from '../db/schema';
import type { AdminAccountType, AdminSession } from '../auth/session.service';
import {
  isOperationalPersonnel,
  resolveOfficeScope,
} from '../common/authz/admin-scope';
import { AdminAuditService } from './admin-audit.service';

// The old role values. Since manuscript revision Phase 2, step 2e this is
// only the type of the admins.role sync mirror and of the historical
// admin_audit_events.actor_role — never read for access (Phase 8 drops both).
export type AdminRole = 'officer' | 'supervisor' | 'focal' | 'system_admin';
export type AdminOffice = 'MEO' | 'MDRRMO';

// No role here: the mirror is write-only (see roleMirror below).
export interface AdminAccountRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  account_type: AdminAccountType;
  is_focal: boolean;
  office: AdminOffice | null;
  created_at: Date;
  is_active: boolean;
}

const SAFE_COLUMNS = {
  id: admins.id,
  first_name: admins.firstName,
  last_name: admins.lastName,
  email: admins.email,
  account_type: admins.accountType,
  is_focal: admins.isFocal,
  office: admins.office,
  created_at: admins.createdAt,
  is_active: admins.isActive,
};

// Deliberately narrower than SAFE_COLUMNS/AdminAccountRow — no created_at,
// no is_active (directory results are always active by construction), and
// never password/session/security columns. This is the shape work-order
// assignment pickers see, not the System Admin Management table.
export interface AdminDirectoryRow {
  id: number;
  name: string;
  email: string;
  office: AdminOffice | null;
  account_type: AdminAccountType;
  is_focal: boolean;
}

interface AccountFields {
  accountType: AdminAccountType;
  isFocal: boolean;
  office: AdminOffice | null;
}

// Shared by create and update — the API side of the database CHECK
// admins_account_type_office_focal_check (migration 0039), so a bad
// combination is a clear 400 instead of a database error:
//   SYSTEM_ADMIN — no office, never Focal;
//   PERSONNEL    — office MEO or MDRRMO; Focal Personnel only on MDRRMO
//                  (organizationally MDRRMO/QRT — not a free choice).
// isFocal may be left out (= not Focal). There is no "clamp" here (unlike
// ticket/report office scoping) — an invalid combination is always a hard
// rejection. This is the one place the account_type/office/is_focal
// invariant is enforced, per the Batch 1 design: centralize it rather than
// duplicating inconsistent conditionals across create()/update().
function assertAccountFields(
  accountType: unknown,
  isFocal: unknown,
  office: unknown,
): AccountFields {
  if (accountType !== 'PERSONNEL' && accountType !== 'SYSTEM_ADMIN') {
    throw new BadRequestException(
      'accountType must be PERSONNEL or SYSTEM_ADMIN.',
    );
  }
  if (isFocal !== undefined && typeof isFocal !== 'boolean') {
    throw new BadRequestException('isFocal must be true or false.');
  }
  const focal = isFocal === true;
  if (accountType === 'SYSTEM_ADMIN') {
    if (office !== null && office !== undefined) {
      throw new BadRequestException('A System Administrator has no office.');
    }
    if (focal) {
      throw new BadRequestException(
        'A System Administrator cannot be Focal Personnel.',
      );
    }
    return { accountType, isFocal: false, office: null };
  }
  if (office !== 'MEO' && office !== 'MDRRMO') {
    throw new BadRequestException('Personnel must have office MEO or MDRRMO.');
  }
  if (focal && office !== 'MDRRMO') {
    throw new BadRequestException('Focal Personnel must have office MDRRMO.');
  }
  return { accountType, isFocal: focal, office };
}

// The admins.role sync mirror (NOT NULL until Phase 8, never read for
// access): Focal Personnel -> 'focal', System Administrator ->
// 'system_admin', other Personnel keep an existing officer/supervisor value
// (the two had identical permissions), else 'officer'.
export function roleMirror(
  fields: Pick<AccountFields, 'accountType' | 'isFocal'>,
  existingRole?: AdminRole,
): AdminRole {
  if (fields.accountType === 'SYSTEM_ADMIN') return 'system_admin';
  if (fields.isFocal) return 'focal';
  return existingRole === 'officer' || existingRole === 'supervisor'
    ? existingRole
    : 'officer';
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

  // Office-scoped read used by the Work Orders assignment picker — distinct
  // from list() above (System-Administrator-only, unscoped, full account
  // shape). Reuses resolveOfficeScope, which now rejects any non-
  // operational caller outright (Batch 1) — this endpoint is routine
  // operational scaffolding, not something Focal Personnel or the System
  // Administrator can call at all. The filter below is a defense-in-depth
  // *allowlist* of operational Personnel (not a denylist of one excluded
  // kind), so a future account kind can never silently become
  // directory-eligible the way an exclusion list would allow — and a Focal
  // account's MDRRMO office never puts it in MDRRMO's directory. See the
  // Batch 1 work-order-assignee safety fix this replaces.
  async listDirectory(
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
    requestedOffice: 'MEO' | 'MDRRMO' | 'all' | undefined,
  ): Promise<AdminDirectoryRow[]> {
    const office = resolveOfficeScope(admin, requestedOffice);
    const rows = await this.db
      .select({
        id: admins.id,
        firstName: admins.firstName,
        lastName: admins.lastName,
        email: admins.email,
        office: admins.office,
        accountType: admins.accountType,
        isFocal: admins.isFocal,
      })
      .from(admins)
      .where(
        and(
          eq(admins.isActive, true),
          office ? eq(admins.office, office) : undefined,
        ),
      )
      .orderBy(asc(admins.firstName), asc(admins.lastName));

    return rows
      .filter((row) => isOperationalPersonnel(row))
      .map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email,
        office: row.office,
        account_type: row.accountType,
        is_focal: row.isFocal,
      }));
  }

  async create(
    input: {
      email: unknown;
      password: unknown;
      firstName: unknown;
      lastName: unknown;
      accountType: unknown;
      isFocal: unknown;
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
    const fields = assertAccountFields(
      input.accountType,
      input.isFocal,
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
        .values({
          email,
          passwordHash,
          firstName,
          lastName,
          ...fields,
          role: roleMirror(fields),
        })
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: {
          adminId: actor.adminId,
          adminName: actor.adminName,
          email: actor.email,
          accountType: actor.accountType,
          office: actor.office,
        },
        actionType: 'admin_created',
        targetType: 'admin',
        targetId: created.id,
        targetSummary: `${created.first_name} ${created.last_name} <${created.email}>`,
        metadata: {
          accountType: created.account_type,
          isFocal: created.is_focal,
          office: created.office,
        },
      });
      return created;
    });
    return row as AdminAccountRow;
  }

  async update(
    id: number,
    input: { accountType: unknown; isFocal: unknown; office: unknown },
    actor: AdminSession,
  ): Promise<AdminAccountRow> {
    const [existing] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.id, id));
    if (!existing) throw new NotFoundException('Admin not found.');

    const fields = assertAccountFields(
      input.accountType,
      input.isFocal,
      input.office,
    );

    // Prevent locking every System Administrator out: only blocks the
    // transition when this row is currently the last System Administrator
    // (active or not, as before) and the change would make it Personnel.
    // Changing a Personnel row, or a System Administrator staying one, is
    // unaffected.
    if (
      existing.accountType === 'SYSTEM_ADMIN' &&
      fields.accountType !== 'SYSTEM_ADMIN'
    ) {
      const [{ systemAdminCount }] = await this.db
        .select({ systemAdminCount: count() })
        .from(admins)
        .where(eq(admins.accountType, 'SYSTEM_ADMIN'));
      if (systemAdminCount <= 1) {
        throw new ConflictException(
          'Cannot remove the last System Administrator.',
        );
      }
    }

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(admins)
        .set({ ...fields, role: roleMirror(fields, existing.role) })
        .where(eq(admins.id, id))
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: {
          adminId: actor.adminId,
          adminName: actor.adminName,
          email: actor.email,
          accountType: actor.accountType,
          office: actor.office,
        },
        actionType: 'admin_role_updated',
        targetType: 'admin',
        targetId: updated.id,
        targetSummary: `${updated.first_name} ${updated.last_name} <${updated.email}>`,
        metadata: {
          from: {
            accountType: existing.accountType,
            isFocal: existing.isFocal,
            office: existing.office,
          },
          to: {
            accountType: updated.account_type,
            isFocal: updated.is_focal,
            office: updated.office,
          },
        },
      });
      return updated;
    });
    return row as AdminAccountRow;
  }

  // Deactivation/reactivation. Mirrors update()'s last-System-Administrator
  // lockout above, scoped to *active* System Administrators — losing login
  // access is functionally equivalent to losing the account type, so
  // removing the last active System Administrator must be blocked here too
  // (this also covers a System Administrator deactivating themselves when
  // they're the only one left, since they're still counted as active at the
  // time of this check).
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

    if (existing.accountType === 'SYSTEM_ADMIN' && !active) {
      const [{ systemAdminCount }] = await this.db
        .select({ systemAdminCount: count() })
        .from(admins)
        .where(
          and(
            eq(admins.accountType, 'SYSTEM_ADMIN'),
            eq(admins.isActive, true),
          ),
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
          accountType: actor.accountType,
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
