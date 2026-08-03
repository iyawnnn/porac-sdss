import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../../db/db.module';
import { citizenIdentities, citizens } from '../../db/schema';
import { SessionService } from '../session.service';
import { logCitizenAuditEvent } from '../../citizens/citizen-audit';
import type { OAuthProfile } from './oauth-profile';
import type { OAuthProvider } from '../oauth-state.service';

export class AccountLinkRequiredError extends Error {}
export class EmailRequiredError extends Error {}
// Covers both: the provider identity already belongs to a *different*
// citizen, and this citizen already has a *different* identity linked for
// the same provider (one identity per provider per citizen, enforced by
// the citizen_identities unique index) — either way, the link attempt
// cannot proceed automatically and must be rejected, not silently merged.
export class IdentityConflictError extends Error {}

@Injectable()
export class OAuthService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly sessions: SessionService,
  ) {}

  // Existing identity -> sign in. New identity + unused email -> create
  // citizen and identity atomically. New identity + email already used by
  // another account -> AccountLinkRequiredError (never silently linked).
  // No (verified) email at all -> EmailRequiredError.
  async loginOrCreate(
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<{ token: string }> {
    const existing = await this.findByIdentity(provider, profile.subject);
    if (existing) {
      return { token: await this.issueToken(existing) };
    }

    if (!profile.email) {
      throw new EmailRequiredError();
    }

    const [emailMatch] = await this.db
      .select()
      .from(citizens)
      .where(sql`lower(${citizens.email}) = ${profile.email}`);
    if (emailMatch) {
      throw new AccountLinkRequiredError();
    }

    const citizen = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(citizens)
        .values({
          email: profile.email as string,
          passwordHash: null,
          firstName: profile.firstName,
          lastName: profile.lastName,
        })
        .returning();

      await tx.insert(citizenIdentities).values({
        citizenId: created.id,
        provider,
        providerSubject: profile.subject,
        providerEmail: profile.email,
      });

      return created;
    });

    return { token: await this.issueToken(citizen) };
  }

  // Attaches a new provider identity to an already-authenticated citizen
  // (the "Link Google/Facebook" button on Account & Security). Never
  // called from the public login flow, and never matches by email — the
  // citizen is already known from their own session, so the only question
  // is whether this specific provider account is free to attach.
  async linkIdentity(
    citizenId: number,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<void> {
    const existingForSubject = await this.findByIdentity(
      provider,
      profile.subject,
    );
    if (existingForSubject) {
      if (existingForSubject.id === citizenId) return; // already linked to self — idempotent
      await logCitizenAuditEvent(
        this.db,
        citizenId,
        'identity_link_conflict_rejected',
        {
          provider,
          reason: 'subject_linked_to_another_citizen',
        },
      );
      throw new IdentityConflictError();
    }

    const [existingForCitizenProvider] = await this.db
      .select({ id: citizenIdentities.id })
      .from(citizenIdentities)
      .where(
        and(
          eq(citizenIdentities.citizenId, citizenId),
          eq(citizenIdentities.provider, provider),
        ),
      );
    if (existingForCitizenProvider) {
      await logCitizenAuditEvent(
        this.db,
        citizenId,
        'identity_link_conflict_rejected',
        {
          provider,
          reason: 'citizen_already_has_different_identity_for_provider',
        },
      );
      throw new IdentityConflictError();
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(citizenIdentities).values({
        citizenId,
        provider,
        providerSubject: profile.subject,
        providerEmail: profile.email,
      });
    });
    await logCitizenAuditEvent(this.db, citizenId, 'provider_linked', {
      provider,
    });
  }

  // "Reauth" for citizens who don't have (or don't want to use) a password:
  // redo the provider round-trip and confirm it resolves to the SAME
  // subject already linked to this citizen — proves live control of the
  // account without creating or changing any identity row.
  async verifyProviderControl(
    citizenId: number,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ providerSubject: citizenIdentities.providerSubject })
      .from(citizenIdentities)
      .where(
        and(
          eq(citizenIdentities.citizenId, citizenId),
          eq(citizenIdentities.provider, provider),
        ),
      );
    return row?.providerSubject === profile.subject;
  }

  private async findByIdentity(
    provider: OAuthProvider,
    subject: string,
  ): Promise<{
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null> {
    const [row] = await this.db
      .select({
        id: citizens.id,
        email: citizens.email,
        firstName: citizens.firstName,
        lastName: citizens.lastName,
      })
      .from(citizenIdentities)
      .innerJoin(citizens, eq(citizenIdentities.citizenId, citizens.id))
      .where(
        and(
          eq(citizenIdentities.provider, provider),
          eq(citizenIdentities.providerSubject, subject),
        ),
      );
    return row ?? null;
  }

  private issueToken(citizen: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    return this.sessions.signCitizenSession({
      citizenId: citizen.id,
      email: citizen.email,
      citizenName: `${citizen.firstName} ${citizen.lastName}`,
    });
  }
}
