-- Manuscript revision Phase 2, step 2b: ticket and report fields from
-- Appendix H and the handoff's data-model table.
--
--   reports.tracking_reference       varchar(50) NOT NULL UNIQUE (App H):
--                                    PRC-<YYYY>-<report id zero-padded to at
--                                    least 6 digits>, YYYY = the submission
--                                    year in Asia/Manila time.
--   reports.submitted_category       varchar(100) NOT NULL (App H): the
--                                    category the citizen picked; never
--                                    changes later.
--   tickets.initial_assigned_office  office NOT NULL (App H): the office
--                                    automatic Initial Routing first assigned;
--                                    kept after reassignment.
--   tickets.resolution_outcome       resolution_outcome, nullable (App H):
--                                    MUNICIPAL_ACTION_COMPLETED |
--                                    EXTERNAL_REFERRAL.
--   tickets.merged_into_ticket_id    integer, nullable, -> tickets(id).
--                                    Implementation extension (handoff
--                                    Decision 11), unused until Phase 3.
--
-- Order: the enum, the columns (all nullable at first), the backfill, the
-- insert triggers, then NOT NULL and the indexes. Every step is safe to
-- re-run (IF NOT EXISTS, guarded DO blocks, CREATE OR REPLACE, backfills
-- that only touch NULLs), so a second run changes 0 rows.
--
-- The two BEFORE INSERT triggers are the single generator of
-- tracking_reference, submitted_category and initial_assigned_office for
-- every future row, whatever inserts it (ReportsService.submit, seeds,
-- tests, a SQL console). They only fill a value left NULL; ReportsService
-- also writes submitted_category and initial_assigned_office explicitly.
--
-- History is NOT rewritten: admin_audit_events, notifications and
-- status_history keep the "Report #<id>" text they recorded.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:ticket-report-fields
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself. The ALTER
-- TABLEs take ACCESS EXCLUSIVE locks held until COMMIT, so no report or
-- ticket can be inserted between the backfill and the triggers.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks and trigger functions contain ';', so the script can't split on
-- line-ending semicolons).
--
-- Before/after check: api/drizzle/0036_ticket_report_fields.check.sql

-- 1. The resolution_outcome enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'resolution_outcome' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE resolution_outcome AS ENUM ('MUNICIPAL_ACTION_COMPLETED', 'EXTERNAL_REFERRAL');
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The columns, nullable until the backfill below. initial_assigned_office
-- uses the same "office" enum as assigned_office (0000_*.sql).
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS initial_assigned_office office,
  ADD COLUMN IF NOT EXISTS resolution_outcome resolution_outcome,
  ADD COLUMN IF NOT EXISTS merged_into_ticket_id integer;
--> statement-breakpoint
-- The self-reference is added on its own, by name, so a re-run can never
-- add a second copy of it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_merged_into_ticket_id_tickets_id_fk'
      AND conrelid = 'tickets'::regclass
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_merged_into_ticket_id_tickets_id_fk
      FOREIGN KEY (merged_into_ticket_id) REFERENCES tickets(id);
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS tracking_reference varchar(50),
  ADD COLUMN IF NOT EXISTS submitted_category varchar(100);
--> statement-breakpoint
-- 3. Backfill. initial_assigned_office: the office the ticket had before its
-- EARLIEST reassignment, else its current office (never reassigned).
UPDATE tickets t
SET initial_assigned_office = COALESCE(
  (
    SELECT r.from_office
    FROM office_reassignments r
    WHERE r.ticket_id = t.id
    ORDER BY r.reassigned_at, r.id
    LIMIT 1
  ),
  t.assigned_office
)
WHERE t.initial_assigned_office IS NULL;
--> statement-breakpoint
-- Every ticket resolved so far went through the municipal resolve dialog;
-- an External Referral outcome can only be chosen from Phase 5. Rejected and
-- active tickets stay NULL.
UPDATE tickets
SET resolution_outcome = 'MUNICIPAL_ACTION_COMPLETED'
WHERE status = 'Resolved' AND resolution_outcome IS NULL;
--> statement-breakpoint
-- Reports never stored their own category, so the ticket's current
-- category stands in for it: there is no category correction yet (Phase 3),
-- and the old automatic merge only grouped same-category reports. For the
-- three categories renamed by 0035 this is the new manuscript name.
UPDATE reports r
SET submitted_category = t.category
FROM tickets t
WHERE t.id = r.ticket_id AND r.submitted_category IS NULL;
--> statement-breakpoint
-- reports.created_at is timestamptz, so AT TIME ZONE 'Asia/Manila' gives
-- the Manila wall-clock time whatever the session time zone (a report sent
-- at 00:30 on 1 January in Porac belongs to the new year). The CASE keeps
-- ids of 7+ digits whole; a bare lpad(id, 6) would truncate them.
UPDATE reports
SET tracking_reference = 'PRC-'
  || to_char(created_at AT TIME ZONE 'Asia/Manila', 'YYYY')
  || '-'
  || CASE WHEN length(id::text) >= 6 THEN id::text ELSE lpad(id::text, 6, '0') END
WHERE tracking_reference IS NULL;
--> statement-breakpoint
-- 4. Insert triggers, the same expressions as the backfill. A serial id is
-- assigned by its column default when the new row is formed, before any
-- BEFORE ROW trigger runs, so NEW.id is already set here (likewise
-- created_at's DEFAULT now(); the COALESCE only covers an explicit NULL).
CREATE OR REPLACE FUNCTION reports_fill_intake_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tracking_reference IS NULL THEN
    NEW.tracking_reference := 'PRC-'
      || to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila', 'YYYY')
      || '-'
      || CASE WHEN length(NEW.id::text) >= 6 THEN NEW.id::text ELSE lpad(NEW.id::text, 6, '0') END;
  END IF;
  IF NEW.submitted_category IS NULL THEN
    NEW.submitted_category := (SELECT category FROM tickets WHERE id = NEW.ticket_id);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reports_fill_intake_fields ON reports;
--> statement-breakpoint
CREATE TRIGGER reports_fill_intake_fields
BEFORE INSERT ON reports
FOR EACH ROW EXECUTE FUNCTION reports_fill_intake_fields();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tickets_fill_initial_assigned_office() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.initial_assigned_office IS NULL THEN
    NEW.initial_assigned_office := NEW.assigned_office;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tickets_fill_initial_assigned_office ON tickets;
--> statement-breakpoint
CREATE TRIGGER tickets_fill_initial_assigned_office
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION tickets_fill_initial_assigned_office();
--> statement-breakpoint
-- 5. Constraints, last. SET NOT NULL is a no-op when already set.
ALTER TABLE reports
  ALTER COLUMN tracking_reference SET NOT NULL,
  ALTER COLUMN submitted_category SET NOT NULL;
--> statement-breakpoint
ALTER TABLE tickets ALTER COLUMN initial_assigned_office SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reports_tracking_reference_unique ON reports (tracking_reference);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tickets_merged_into_ticket_id_idx ON tickets (merged_into_ticket_id);
