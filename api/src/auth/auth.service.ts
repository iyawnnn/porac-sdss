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

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly sessions: SessionService,
  ) {}

  async adminLogin(
    email: unknown,
    password: unknown,
  ): Promise<{ token: string; office: 'MEO' | 'MDRRMO' | null }> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Email and password are required');
    }

    const [admin] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    // Deactivated admins get the same generic error as a wrong password —
    // deliberately not a distinct message, so a login attempt can't be used
    // to probe whether an email belongs to a deactivated account.
    if (
      !admin ||
      !admin.isActive ||
      !(await bcrypt.compare(password, admin.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.sessions.signAdminSession({
      adminId: admin.id,
      email: admin.email,
      adminName: `${admin.firstName} ${admin.lastName}`,
      office: admin.office,
      role: admin.role,
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
