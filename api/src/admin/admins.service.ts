import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins } from '../db/schema';

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
}

const SAFE_COLUMNS = {
  id: admins.id,
  first_name: admins.firstName,
  last_name: admins.lastName,
  email: admins.email,
  role: admins.role,
  office: admins.office,
  created_at: admins.createdAt,
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
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase) {}

  async list(): Promise<AdminAccountRow[]> {
    return this.db
      .select(SAFE_COLUMNS)
      .from(admins)
      .orderBy(desc(admins.createdAt)) as Promise<AdminAccountRow[]>;
  }

  async create(input: {
    email: unknown;
    password: unknown;
    firstName: unknown;
    lastName: unknown;
    role: unknown;
    office: unknown;
  }): Promise<AdminAccountRow> {
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
    const [row] = await this.db
      .insert(admins)
      .values({ email, passwordHash, firstName, lastName, role, office })
      .returning(SAFE_COLUMNS);
    return row as AdminAccountRow;
  }

  async update(
    id: number,
    input: { role: unknown; office: unknown },
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

    const [row] = await this.db
      .update(admins)
      .set({ role, office })
      .where(eq(admins.id, id))
      .returning(SAFE_COLUMNS);
    return row as AdminAccountRow;
  }
}
