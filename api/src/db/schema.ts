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
export const adminRoleEnum = pgEnum('admin_role', ['officer', 'supervisor']);

export const citizens = pgTable('citizens', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  office: officeEnum('office').notNull(),
  role: adminRoleEnum('role').notNull(),
});
