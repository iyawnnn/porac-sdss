-- Manuscript revision Phase 3, step 3f: Focal severity screening (Appendix
-- H REPORTS severity_screening_* fields; Table 2).
--
--   reports.severity_screening_status    severity_screening_status, NOT NULL,
--                                        DEFAULT 'NOT_REVIEWED'
--   reports.severity_screening_remarks   text, nullable
--   reports.severity_screened_by_admin_id
--                                        integer, nullable, FK admins(id)
--                                        (Appendix H's FK, as in
--                                        routing_actions)
--   reports.severity_screened_at         timestamptz, nullable
--
-- Focal Personnel record whether the citizen's severity needs operational
-- validation. Screening is advisory: it never changes citizen_severity, the
-- ticket's severity (the MAX citizen_severity of its reports) or
-- Operational Priority.
--
-- Group decision: severity screening replaces the old general "screened"
-- intake action. Old report_intake_actions 'screened' rows are kept as
-- history and never written again; they recorded no screening outcome, so
-- nothing is backfilled from them and every existing report starts as
-- NOT_REVIEWED (the column default). No UPDATE runs: a second run changes
-- 0 rows.
--
-- The CHECK rule (reports_severity_screening_consistency_check): a report
-- that is NOT_REVIEWED has no screener and no screening time; any other
-- status has both. Remarks are not part of the rule (the check file counts
-- remarks without a screening separately).
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:severity-screening
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0041_severity_screening.check.sql

-- 1. The screening status enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'severity_screening_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE severity_screening_status AS ENUM (
      'NOT_REVIEWED', 'NO_CONCERN_NOTED', 'REQUIRES_OPERATIONAL_VALIDATION'
    );
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The four report columns. Every existing report gets NOT_REVIEWED from
-- the default; the other three stay NULL.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS severity_screening_status severity_screening_status
    NOT NULL DEFAULT 'NOT_REVIEWED',
  ADD COLUMN IF NOT EXISTS severity_screening_remarks text,
  ADD COLUMN IF NOT EXISTS severity_screened_by_admin_id integer REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS severity_screened_at timestamptz;
--> statement-breakpoint
-- 3. The CHECK rule. ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_severity_screening_consistency_check'
      AND conrelid = 'reports'::regclass
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_severity_screening_consistency_check CHECK (
      (
        severity_screening_status = 'NOT_REVIEWED'
        AND severity_screened_by_admin_id IS NULL
        AND severity_screened_at IS NULL
      )
      OR (
        severity_screening_status <> 'NOT_REVIEWED'
        AND severity_screened_by_admin_id IS NOT NULL
        AND severity_screened_at IS NOT NULL
      )
    );
  END IF;
END
$$;
