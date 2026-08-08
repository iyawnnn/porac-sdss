// Non-spatial Drizzle table definitions. Tables with geometry columns
// (barangays, dem_points, city_boundary_osm, rate_limit_events, and the
// geom/pin_geom/exif_geom columns on tickets/reports) are created and
// queried via the raw PG client (db/db.module.ts's PG token) instead — see
// that file for why. Their non-Drizzle table shapes are documented in the
// comment block below.
import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Tables that exist in Postgres but are intentionally absent from this
// file — Drizzle never queries them directly, only the raw PG client does:
//
//   barangays          (drizzle/... import:barangays-v2 script) — id, name,
//                       geom geometry(MultiPolygon, 4326), + PSGC metadata
//   dem_points         (scripts/seed-dem.ts) — id, elevation_m real,
//                       geom geometry(Point, 4326)
//   city_boundary_osm  (drizzle/0006_city_boundary_osm.sql) — id, source,
//                       geom geometry(MultiPolygon, 4326), imported_at
//   config             (drizzle/0007_config.sql) — key text PK, value,
//                       computed_at, note
//   rate_limit_events  (drizzle/0003_ratelimit.sql, 0005_ratelimit_citizen.sql)
//                       — id, ip, geom geometry(Point, 4326), created_at,
//                       citizen_id -> citizens.id
//   barangays_gadm_old (docs/migration-log-gadm-to-psgc.md) — rollback/
//                       reference only, never queried by app code

export const ticketStatusEnum = pgEnum('ticket_status', [
  'Reported',
  'Under Review',
  'In Progress',
  'Resolved',
  'Rejected',
]);
export const officeEnum = pgEnum('office', ['MEO', 'MDRRMO']);
// 'system_admin' has no office of its own (admins.office is nullable for
// exactly this role) — it bypasses office scoping instead of belonging to
// a third office value. See api/src/common/authz/admin-scope.ts.
export const adminRoleEnum = pgEnum('admin_role', [
  'officer',
  'supervisor',
  'system_admin',
]);
// 'facebook' is retained in the enum only because Postgres can't cheaply
// drop an enum value (would need a full type-rebuild migration) — no code
// path issues it anymore (Facebook OAuth was removed; Google is the only
// social login provider) and no row has ever used it (verified empty
// citizen_identities before removal). Not worth a migration to excise.
export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'facebook',
]);

export const citizens = pgTable('citizens', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  // Nullable: OAuth-only citizens (Google) never set a password —
  // see citizen_identities below. Password-based signup/login still always
  // populates this.
  passwordHash: text('password_hash'),
  // Set/refreshed whenever password_hash is set or changed via the Account
  // & Security page — never touched by anything else.
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  // Bumped to now() on a successful password reset (never on ordinary
  // login/signup). SessionService.verifyCitizenSession rejects any token
  // whose `iat` predates this — the one place a stateless JWT session can
  // actually be invalidated server-side. Null means "never invalidated,
  // accept any iat" (the default for every existing/new citizen).
  sessionValidAfter: timestamp('session_valid_after', { withTimezone: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per (citizen, external provider identity). A citizen can hold at
// most one identity per provider (unique citizen_id+provider) — Google is
// the only provider the app issues today; a given provider account can only
// ever back one citizen (unique provider+provider_subject) so two citizens
// can't both claim the same external account.
export const citizenIdentities = pgTable('citizen_identities', {
  id: serial('id').primaryKey(),
  citizenId: integer('citizen_id')
    .notNull()
    .references(() => citizens.id),
  provider: oauthProviderEnum('provider').notNull(),
  providerSubject: text('provider_subject').notNull(),
  providerEmail: text('provider_email'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per issued reset link. Only a SHA-256 hash of the actual token
// is ever stored (the raw token exists only in the emailed URL and the
// requesting citizen's browser) — token_hash is the lookup key precisely
// because it's useless to an attacker who reads the database. used_at
// makes the token single-use; expires_at makes it short-lived.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  citizenId: integer('citizen_id')
    .notNull()
    .references(() => citizens.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Independent rate-limit counters for POST /citizens/forgot-password, keyed
// by IP and by normalized email — separate from rate_limit_events (report
// submission) because that table's geom column is NOT NULL and doesn't fit
// a non-geo, pre-authentication event. One row per *request attempt*,
// including ones for emails that don't exist, so enumeration probing can't
// dodge the limit by trying many addresses.
export const passwordResetRateLimitEvents = pgTable(
  'password_reset_rate_limit_events',
  {
    id: serial('id').primaryKey(),
    ip: text('ip').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  barangayId: integer('barangay_id').notNull(),
  status: ticketStatusEnum('status').notNull().default('Reported'),
  memberCount: integer('member_count').notNull().default(1),
  elevationM: real('elevation_m'),
  elevationFactor: real('elevation_factor'),
  precipitationFactor: real('precipitation_factor'),
  clusterFactor: real('cluster_factor'),
  urgencyScore: real('urgency_score'),
  urgencyBand: text('urgency_band'),
  // priorityIndex (common/utils/scoring.ts's severity/age/density model)
  // powers the separate "Priority Breakdown" card on the ticket detail page
  // (GET /admin/tickets/:id/priority-context) — not shown as the headline
  // "Priority" number anywhere.
  priorityIndex: integer('priority_index'),
  // priorityScore/urgencyLevel (domain/urgency.ts's elevation/rain/cluster
  // model) is the canonical "Priority" value rendered on the admin
  // Dashboard, Ticket Queue, and Ticket Detail header — the same number the
  // "System urgency" card on ticket detail derives its band from.
  priorityScore: integer('priority_score'),
  urgencyLevel: text('urgency_level'),
  assignedOffice: officeEnum('assigned_office').notNull(),
  // Set when a report attached to this ticket is quarantined during
  // moderation — surfaced to admins separately from urgency/priority,
  // which are purely environmental/cluster-driven.
  flagged: boolean('flagged').notNull().default(false),
  // Optional field-team proof photo + notes captured when a ticket
  // transitions to Resolved (admin ticket detail "Mark Resolved" modal).
  resolutionImageUrl: text('resolution_image_url'),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // geom geometry(Point, 4326) NOT NULL — set via the raw PG client, see
  // drizzle/0001_geometry.sql. Not modeled here; Drizzle's PostGIS support
  // is too weak for the ST_* functions this column is queried with.
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id),
  citizenId: integer('citizen_id')
    .notNull()
    .references(() => citizens.id),
  title: text('title').notNull(),
  description: text('description'),
  citizenSeverity: text('citizen_severity').notNull(),
  elevationM: real('elevation_m'),
  exifCapturedAt: timestamp('exif_captured_at', { withTimezone: true }),
  // Full EXIF payload backing the admin flagged-report view, alongside the
  // derived exifCapturedAt/exifGeom columns.
  exifData: jsonb('exif_data'),
  imageUrl: text('image_url').notNull(),
  imagePhash: text('image_phash'),
  locationMismatchM: real('location_mismatch_m'),
  flags: text('flags').array(),
  // Set by the moderation flow's dismiss/quarantine/duplicate action. NULL
  // means "not yet reviewed" (the /admin/flagged queue filters on this).
  moderationStatus: text('moderation_status'),
  moderationNote: text('moderation_note'),
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  moderatedBy: text('moderated_by'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // geom / pin_geom geometry(Point, 4326) NOT NULL, exif_geom
  // geometry(Point, 4326) nullable — set via the raw PG client, see
  // drizzle/0001_geometry.sql. Not modeled here for the same reason as
  // tickets.geom above.
});

export const statusHistory = pgTable('status_history', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id),
  status: ticketStatusEnum('status').notNull(),
  adminId: integer('admin_id'),
  adminName: text('admin_name'),
  changedAt: timestamp('changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Separate from status_history because that table's `status` column is
// typed as ticket_status — an office reassignment isn't a status value and
// stuffing one in there would corrupt any query that reads status_history
// as a status timeline.
export const officeReassignments = pgTable('office_reassignments', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id),
  fromOffice: officeEnum('from_office').notNull(),
  toOffice: officeEnum('to_office').notNull(),
  adminId: integer('admin_id'),
  adminName: text('admin_name'),
  reassignedAt: timestamp('reassigned_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id),
  citizenId: text('citizen_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only trail for the Account & Security page's sensitive actions
// (provider linked/unlinked, password set/changed, rejected link conflicts)
// — never updated or deleted, only inserted.
export const citizenAuditEvents = pgTable('citizen_audit_events', {
  id: serial('id').primaryKey(),
  citizenId: integer('citizen_id')
    .notNull()
    .references(() => citizens.id),
  eventType: text('event_type').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationRecipientTypeEnum = pgEnum(
  'notification_recipient_type',
  ['admin', 'citizen'],
);

// One row per notification, targeted exactly one of two ways (never both):
// recipient_id (a specific admin_id or citizen_id, depending on
// recipient_type) for individual notifications, or recipient_office
// (admin-only) for office-wide ones — read at query time by every admin in
// that office, the same idiom tickets.service.ts already uses for
// office-scoped ticket queries (no per-admin fan-out rows). No FK on
// recipient_id since it points to one of two different tables depending on
// recipient_type — same reasoning as status_history.admin_id/
// office_reassignments.admin_id above, which are also FK-less for the same
// cross-table reason.
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientType: notificationRecipientTypeEnum('recipient_type').notNull(),
  recipientId: integer('recipient_id'),
  recipientOffice: officeEnum('recipient_office'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  href: text('href'),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  office: officeEnum('office'),
  role: adminRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Set/refreshed whenever password_hash changes (own change or a System
  // Admin reset) — mirrors citizens.password_changed_at.
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  // Bumped to now() on the same two events. SessionService.verifyAdminSession
  // rejects any token whose `iat` predates this — the admin equivalent of
  // citizens.session_valid_after, the one place a stateless JWT admin
  // session can actually be invalidated server-side. Null means "never
  // invalidated, accept any iat" (the default for every existing/new admin).
  sessionValidAfter: timestamp('session_valid_after', { withTimezone: true }),
});

// Append-only trail for administrative actions (account create/role change,
// ticket status/reassignment, report moderation) — System Administrator
// visible only, see api/src/admin/admin-audit.service.ts. actor_* columns
// are a snapshot at write time (name/role/office can change later on the
// admins row itself) so history reads correctly even after the actor is
// edited. No FK on actor_admin_id — same cross-table reasoning as
// status_history.admin_id/office_reassignments.admin_id above.
export const adminAuditEvents = pgTable('admin_audit_events', {
  id: serial('id').primaryKey(),
  actorAdminId: integer('actor_admin_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorRole: adminRoleEnum('actor_role').notNull(),
  actorOffice: officeEnum('actor_office'),
  actionType: text('action_type').notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  targetSummary: text('target_summary').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
