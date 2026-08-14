import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins, citizens } from '../db/schema';
import { SessionService } from './session.service';
import { RateLimitService } from '../domain/ratelimit.service';
import { normalizeEmail } from '../common/utils/normalize-email';
import { AdminAuditService } from '../admin/admin-audit.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  async adminLogin(
    email: unknown,
    password: unknown,
  ): Promise<{ token: string; office: 'MEO' | 'MDRRMO' | null }> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Email and password are required');
    }

    // Checked, and keyed, on the normalized email — before the admins table
    // is even queried — so a throttled request never runs bcrypt and never
    // records another failure of its own. Never keyed on IP: an IP-based
    // total-login limit would break the E2E suite, which logs in from one
    // IP nearly 200 times per run (docs/testing.md §6).
    const normalized = normalizeEmail(email);
    const rateLimitResult =
      await this.rateLimit.checkAdminLoginRateLimit(normalized);
    if (!rateLimitResult.allowed) {
      // Same generic message as every other rejection below — the
      // throttled response must stay indistinguishable from a normal
      // failed login (see the comment on the block below).
      throw new UnauthorizedException('Invalid email or password');
    }

    const [admin] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    // Deactivated admins get the same generic error as a wrong password —
    // deliberately not a distinct message, so a login attempt can't be used
    // to probe whether an email belongs to a deactivated account. Recording
    // a failure here for every rejection reason (nonexistent, deactivated,
    // wrong password) — never only for real/active accounts — is what keeps
    // the throttle itself from becoming a second enumeration side-channel.
    if (
      !admin ||
      !admin.isActive ||
      !(await bcrypt.compare(password, admin.passwordHash))
    ) {
      await this.rateLimit.recordAdminLoginFailure(normalized);
      if (admin) {
        await this.adminAudit.logBestEffort({
          actor: {
            adminId: admin.id,
            adminName: `${admin.firstName} ${admin.lastName}`,
            email: admin.email,
            role: admin.role,
            office: admin.office,
          },
          actionType: 'admin_login_failed',
          targetType: 'admin',
          targetId: admin.id,
          targetSummary: `Failed login attempt for ${admin.email}`,
        });
      }
      // Nonexistent email: no admin row to attribute an actor to, and
      // actor_admin_id/target_id are NOT NULL on admin_audit_events — a
      // fabricated id was rejected as the same schema-shape hack disallowed
      // for export audit logging. Skipping the write also avoids creating an
      // internal side channel: a distinguishable audit path for "email
      // doesn't exist" vs "email exists but wrong password" would undermine
      // the enumeration resistance this endpoint already provides, even
      // though it never reaches the HTTP response. Only failed attempts
      // against an existing admin are in scope (Issue #49).
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.rateLimit.resetAdminLoginFailures(normalized);

    const token = await this.sessions.signAdminSession({
      adminId: admin.id,
      email: admin.email,
      adminName: `${admin.firstName} ${admin.lastName}`,
      office: admin.office,
      role: admin.role,
    });

    await this.adminAudit.logBestEffort({
      actor: {
        adminId: admin.id,
        adminName: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role: admin.role,
        office: admin.office,
      },
      actionType: 'admin_login',
      targetType: 'admin',
      targetId: admin.id,
      targetSummary: `${admin.firstName} ${admin.lastName} logged in`,
    });

    return { token, office: admin.office };
  }

  async citizenLogin(
    email: unknown,
    password: unknown,
  ): Promise<{ token: string }> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Email and password are required');
    }

    const [citizen] = await this.db
      .select()
      .from(citizens)
      .where(eq(citizens.email, email));
    // passwordHash is null for OAuth-only citizens (see citizen_identities) —
    // bcrypt.compare() throws on a null hash instead of just failing, so
    // this must be checked explicitly rather than falling through to it.
    if (
      !citizen ||
      !citizen.passwordHash ||
      !(await bcrypt.compare(password, citizen.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.sessions.signCitizenSession({
      citizenId: citizen.id,
      email: citizen.email,
      citizenName: `${citizen.firstName} ${citizen.lastName}`,
    });

    return { token };
  }

  async citizenSignup(
    email: unknown,
    password: unknown,
    firstName: unknown,
    lastName: unknown,
  ): Promise<{ token: string }> {
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof firstName !== 'string' ||
      typeof lastName !== 'string' ||
      password.length < 8
    ) {
      throw new BadRequestException(
        'Email, password (min 8 chars), first name, and last name are required.',
      );
    }

    const [existing] = await this.db
      .select()
      .from(citizens)
      .where(eq(citizens.email, email));
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [citizen] = await this.db
      .insert(citizens)
      .values({ email, passwordHash, firstName, lastName })
      .returning();

    const token = await this.sessions.signCitizenSession({
      citizenId: citizen.id,
      email: citizen.email,
      citizenName: `${citizen.firstName} ${citizen.lastName}`,
    });

    return { token };
  }
}
