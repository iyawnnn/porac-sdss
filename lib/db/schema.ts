// Non-spatial Drizzle table definitions. Tables with geometry columns
// (barangays, dem_points, and the geom/pin_geom/exif_geom columns on
// tickets/reports) are created and queried via lib/db/raw.ts instead —
// see that file for why.
import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", [
  "Reported",
  "Under Review",
  "In Progress",
  "Resolved",
]);
export const officeEnum = pgEnum("office", ["MEO", "MDRRMO"]);
export const adminRoleEnum = pgEnum("admin_role", ["officer", "supervisor"]);

export const citizens = pgTable("citizens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  barangayId: integer("barangay_id").notNull(),
  status: ticketStatusEnum("status").notNull().default("Reported"),
  memberCount: integer("member_count").notNull().default(1),
  elevationM: real("elevation_m"),
  elevationFactor: real("elevation_factor"),
  precipitationFactor: real("precipitation_factor"),
  clusterFactor: real("cluster_factor"),
  urgencyScore: real("urgency_score"),
  urgencyBand: text("urgency_band"),
  priorityIndex: integer("priority_index"),
  assignedOffice: officeEnum("assigned_office").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  citizenId: integer("citizen_id")
    .notNull()
    .references(() => citizens.id),
  title: text("title").notNull(),
  description: text("description"),
  citizenSeverity: text("citizen_severity").notNull(),
  elevationM: real("elevation_m"),
  exifCapturedAt: timestamp("exif_captured_at", { withTimezone: true }),
  imageUrl: text("image_url").notNull(),
  imagePhash: text("image_phash"),
  locationMismatchM: real("location_mismatch_m"),
  flags: text("flags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusHistory = pgTable("status_history", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  status: ticketStatusEnum("status").notNull(),
  adminId: integer("admin_id"),
  adminName: text("admin_name"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Separate from status_history because that table's `status` column is
// typed as ticket_status — an office reassignment isn't a status value and
// stuffing one in there would corrupt any query that reads status_history
// as a status timeline.
export const officeReassignments = pgTable("office_reassignments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  fromOffice: officeEnum("from_office").notNull(),
  toOffice: officeEnum("to_office").notNull(),
  adminId: integer("admin_id"),
  adminName: text("admin_name"),
  reassignedAt: timestamp("reassigned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => tickets.id),
  citizenId: text("citizen_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  office: officeEnum("office").notNull(),
  role: adminRoleEnum("role").notNull(),
});
