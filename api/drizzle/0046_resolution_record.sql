-- Manuscript revision Phase 5, step 5c (step 1 of 2): the resolution record
-- and the return-to-Under-Review history. Columns and CHECK rules only; the
-- API and screens that write them come in step 2.
--
-- Additive only: no column is renamed, dropped or rewritten, nothing is
-- backfilled and no existing row is updated. Tickets resolved before this
-- step keep whatever resolution_outcome they have (migration 0036 gave every
-- one of them MUNICIPAL_ACTION_COMPLETED) and are told apart by
-- resolved_at IS NULL ("legacy"); every CHECK below accepts them.
--
-- tickets gains:
--   resolved_at           timestamptz, set when a ticket is resolved from
--                         step 2 on; NULL on every legacy Resolved ticket.
--   resolved_by_admin_id  integer, FK admins(id)
--                         (tickets_resolved_by_admin_id_fkey), the staff
--                         member who resolved it. Not indexed: like this
--                         repo's other *_by_admin_id FKs
--                         (work_orders.cancelled_by_admin_id,
--                         reports.severity_screened_by_admin_id), nothing
--                         looks tickets up by it.
-- with three named CHECKs:
--   tickets_resolved_at_status_check         resolved_at only on a Resolved
--                                            ticket.
--   tickets_resolution_record_check          a ticket with resolved_at has an
--                                            outcome, the resolving admin and
--                                            non-blank resolution notes.
--                                            Legacy Resolved tickets
--                                            (resolved_at NULL) are exempt,
--                                            so their blank notes stay valid
--                                            on every later UPDATE.
--   tickets_resolution_outcome_status_check  resolution_outcome only on a
--                                            Resolved ticket. This is the one
--                                            rule existing rows could break:
--                                            statement 1 stops the migration
--                                            before anything is changed if a
--                                            non-Resolved ticket already has
--                                            an outcome. Those rows are never
--                                            fixed here.
--
-- status_history gains (all nullable, NULL on every existing row):
--   from_status           ticket_status, the status the ticket left.
--   reason                text, why (required for a return to Under Review).
--   resolution_outcome    resolution_outcome  } snapshot of the resolution,
--   resolution_notes      text                } on a Resolved row, kept after
--   resolution_image_url  text                } the ticket row is cleared by
--                                               a return (step 2).
-- with three named CHECKs:
--   status_history_resolution_snapshot_check  the snapshot columns only on a
--                                             Resolved row.
--   status_history_return_reason_check        a Resolved -> Under Review row
--                                             has a non-blank reason.
--   status_history_reason_nonblank_check      reason is NULL or non-blank.
-- Existing status_history rows have from_status and reason NULL and no
-- snapshot, so all three accept them.
--
-- Every statement is guarded (IF NOT EXISTS, or a pg_constraint lookup), so
-- a second run changes nothing.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:resolution-record
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0046_resolution_record.check.sql

-- 1. Stop before changing anything if a non-Resolved ticket already has a
-- resolution_outcome (it would break tickets_resolution_outcome_status_check).
DO $$
DECLARE
  outcome_on_non_resolved int;
BEGIN
  SELECT count(*) INTO outcome_on_non_resolved
  FROM tickets WHERE resolution_outcome IS NOT NULL AND status <> 'Resolved';
  IF outcome_on_non_resolved > 0 THEN
    RAISE EXCEPTION
      '0046 stopped, nothing changed: % non-Resolved ticket(s) already have a resolution_outcome. Nothing is fixed here; correct these rows by hand and run again.',
      outcome_on_non_resolved;
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The two ticket columns. resolved_by_admin_id has a real FK to
-- admins(id) (admins.id is serial, so integer), named so a re-run never adds
-- a second copy.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_admin_id integer
    CONSTRAINT tickets_resolved_by_admin_id_fkey REFERENCES admins(id);
--> statement-breakpoint
-- 3. The three ticket CHECK rules (see the header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_resolved_at_status_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_resolved_at_status_check CHECK (
      resolved_at IS NULL OR status = 'Resolved'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_resolution_record_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_resolution_record_check CHECK (
      resolved_at IS NULL
      OR (
        resolution_outcome IS NOT NULL
        AND resolved_by_admin_id IS NOT NULL
        AND btrim(coalesce(resolution_notes, '')) <> ''
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_resolution_outcome_status_check'
      AND conrelid = 'public.tickets'::regclass
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_resolution_outcome_status_check CHECK (
      resolution_outcome IS NULL OR status = 'Resolved'
    );
  END IF;
END
$$;
--> statement-breakpoint
-- 4. The five status_history columns.
ALTER TABLE status_history
  ADD COLUMN IF NOT EXISTS from_status ticket_status,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS resolution_outcome resolution_outcome,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS resolution_image_url text;
--> statement-breakpoint
-- 5. The three status_history CHECK rules (see the header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'status_history_resolution_snapshot_check'
      AND conrelid = 'public.status_history'::regclass
  ) THEN
    ALTER TABLE status_history ADD CONSTRAINT status_history_resolution_snapshot_check CHECK (
      (
        resolution_outcome IS NULL
        AND resolution_notes IS NULL
        AND resolution_image_url IS NULL
      )
      OR status = 'Resolved'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'status_history_return_reason_check'
      AND conrelid = 'public.status_history'::regclass
  ) THEN
    ALTER TABLE status_history ADD CONSTRAINT status_history_return_reason_check CHECK (
      NOT (from_status = 'Resolved' AND status = 'Under Review')
      OR btrim(coalesce(reason, '')) <> ''
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'status_history_reason_nonblank_check'
      AND conrelid = 'public.status_history'::regclass
  ) THEN
    ALTER TABLE status_history ADD CONSTRAINT status_history_reason_nonblank_check CHECK (
      reason IS NULL OR btrim(reason) <> ''
    );
  END IF;
END
$$;
