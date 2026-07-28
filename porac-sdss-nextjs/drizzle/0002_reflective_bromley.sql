CREATE TABLE "office_reassignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"from_office" "office" NOT NULL,
	"to_office" "office" NOT NULL,
	"admin_id" integer,
	"admin_name" text,
	"reassigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "office_reassignments" ADD CONSTRAINT "office_reassignments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;