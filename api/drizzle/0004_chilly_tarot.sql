CREATE TABLE "citizens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citizens_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- text -> integer has no implicit cast; USING NULL is safe here because
-- reports is truncated before this migration runs (citizen_id was never
-- populated under the old anonymous-submission flow).
ALTER TABLE "reports" ALTER COLUMN "citizen_id" TYPE integer USING NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "citizen_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_citizen_id_citizens_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizens"("id") ON DELETE no action ON UPDATE no action;