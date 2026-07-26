CREATE TYPE "public"."admin_role" AS ENUM('officer', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."office" AS ENUM('CEO', 'ACDRRMO');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('Reported', 'Under Review', 'In Progress', 'Resolved');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"office" "office" NOT NULL,
	"role" "admin_role" NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"citizen_id" text,
	"title" text NOT NULL,
	"description" text,
	"citizen_severity" text NOT NULL,
	"elevation_m" real,
	"exif_captured_at" timestamp with time zone,
	"image_url" text NOT NULL,
	"image_phash" text,
	"location_mismatch_m" real,
	"flags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"status" "ticket_status" NOT NULL,
	"admin_id" integer,
	"admin_name" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"barangay_id" integer NOT NULL,
	"status" "ticket_status" DEFAULT 'Reported' NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"elevation_m" real,
	"elevation_factor" real,
	"precipitation_factor" real,
	"cluster_factor" real,
	"urgency_score" real,
	"urgency_band" text,
	"assigned_office" "office" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"citizen_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;