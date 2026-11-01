-- Manuscript revision Phase 5, step 5b: Operational Assessment and Work
-- Orders (manuscript pp. 44-45, Appendix H OPERATIONAL_ASSESSMENTS and
-- WORK_ORDERS, Tables 3-4, Appendix I).
--
-- Additive only: new columns, CHECK rules, a UNIQUE constraint, foreign keys
-- and one index. No column is renamed, dropped or rewritten and nothing is
-- backfilled. The App H names that differ from ours (assessed_conditions,
-- interim_mitigation, deferment_or_referral_reason, created_at, JSONB
-- operational_constraints, NOT NULL + FK assessed_by_admin_id) are mapped in
-- the docs and the staff read models; the physical renames are left to the
-- Phase 8 cleanup.
--
-- work_orders gains:
--   cancellation_reason        text
--   cancelled_by_admin_id      integer, FK admins(id)
--   cancelled_at               timestamptz
--   replacement_work_order_id  integer, FK (replacement_work_order_id,
--                              ticket_id) -> work_orders (id, ticket_id), so
--                              a replacement is always on the same ticket.
--                              That FK needs UNIQUE (id, ticket_id)
--                              (work_orders_id_ticket_id_unique).
--
-- Named CHECK rules on work_orders, all keyed so existing rows stay valid:
--   work_orders_cancellation_check          a row with cancelled_at set is
--                                           cancelled and has a non-blank
--                                           cancellation_reason and a
--                                           cancelled_by_admin_id. Keyed on
--                                           cancelled_at, NOT on status:
--                                           Work Orders cancelled before this
--                                           step have no cancelled_at and
--                                           keep an empty reason.
--   work_orders_cancellation_fields_check   cancellation_reason,
--                                           cancelled_by_admin_id and
--                                           replacement_work_order_id only on
--                                           a row with cancelled_at set.
--   work_orders_replacement_not_self_check  a Work Order is never its own
--                                           replacement.
--   work_orders_completed_at_check          a completed row has completed_at.
--   work_orders_cancelled_not_completed_check
--                                           a cancelled row has no
--                                           completed_at.
--
-- The last two CHECKs apply to existing rows too. Statement 1 counts the rows
-- that would break them and, if there are any, stops the migration with the
-- counts before anything is changed. Nothing is backfilled to make them
-- pass: fix the reported rows by hand and run it again. (The migrate script
-- runs the same count first and stops before opening the transaction.)
--
-- operational_assessments gains:
--   actual_action                 text
--   supporting_evidence_url       text (a URL or a file path; format is
--                                 checked in the API)
--   operational_constraint_notes  jsonb NOT NULL DEFAULT '{}' - one note per
--                                 selected constraint key, beside the
--                                 existing operational_constraints text[]
--                                 tags (same 12 keys, checked in the API)
-- with two named CHECKs:
--   operational_assessments_evidence_url_check      NULL, or non-blank and
--                                                   at most 2048 characters;
--   operational_assessments_constraint_notes_check  a JSON object.
-- Existing rows get NULL / NULL / '{}' and stay valid.
--
-- Every statement is guarded (IF NOT EXISTS, or a pg_constraint lookup), so
-- a second run changes nothing.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:assessment-work-orders
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0045_assessment_work_orders.check.sql

-- 1. Stop before changing anything if an existing Work Order would break
-- work_orders_completed_at_check or work_orders_cancelled_not_completed_check.
DO $$
DECLARE
  completed_without_completed_at int;
  cancelled_with_completed_at int;
BEGIN
  SELECT count(*) INTO completed_without_completed_at
  FROM work_orders WHERE status = 'completed' AND completed_at IS NULL;
  SELECT count(*) INTO cancelled_with_completed_at
  FROM work_orders WHERE status = 'cancelled' AND completed_at IS NOT NULL;
  IF completed_without_completed_at > 0 OR cancelled_with_completed_at > 0 THEN
    RAISE EXCEPTION
      '0045 stopped, nothing changed: % completed work order(s) without completed_at, % cancelled work order(s) with completed_at. Nothing is backfilled; fix these rows by hand and run again.',
      completed_without_completed_at, cancelled_with_completed_at;
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The four Work Order columns. cancelled_by_admin_id has a real FK to
-- admins(id), as Appendix H defines it.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by_admin_id integer
    CONSTRAINT work_orders_cancelled_by_admin_id_fkey REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_work_order_id integer;
--> statement-breakpoint
-- 3. UNIQUE (id, ticket_id), which the same-ticket replacement FK refers to.
-- id is already unique, so no existing row can break it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_id_ticket_id_unique'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_id_ticket_id_unique UNIQUE (id, ticket_id);
  END IF;
END
$$;
--> statement-breakpoint
-- 4. The replacement is a Work Order on the same ticket. With the default
-- MATCH SIMPLE, a NULL replacement_work_order_id is not checked.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_replacement_same_ticket_fkey'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_replacement_same_ticket_fkey
      FOREIGN KEY (replacement_work_order_id, ticket_id)
      REFERENCES work_orders (id, ticket_id);
  END IF;
END
$$;
--> statement-breakpoint
-- 5. The five Work Order CHECK rules (see the header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_cancellation_check'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_cancellation_check CHECK (
      cancelled_at IS NULL
      OR (
        status = 'cancelled'
        AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''
        AND cancelled_by_admin_id IS NOT NULL
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_cancellation_fields_check'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_cancellation_fields_check CHECK (
      cancelled_at IS NOT NULL
      OR (
        cancellation_reason IS NULL
        AND cancelled_by_admin_id IS NULL
        AND replacement_work_order_id IS NULL
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_replacement_not_self_check'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_replacement_not_self_check CHECK (
      replacement_work_order_id IS NULL OR replacement_work_order_id <> id
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_completed_at_check'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_completed_at_check CHECK (
      status <> 'completed' OR completed_at IS NOT NULL
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_cancelled_not_completed_check'
      AND conrelid = 'public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_cancelled_not_completed_check CHECK (
      status <> 'cancelled' OR completed_at IS NULL
    );
  END IF;
END
$$;
--> statement-breakpoint
-- 6. Index for the replacement FK (finding the Work Orders that name a given
-- one as their replacement). Partial: most rows have none.
CREATE INDEX IF NOT EXISTS work_orders_replacement_work_order_id_idx
  ON work_orders (replacement_work_order_id)
  WHERE replacement_work_order_id IS NOT NULL;
--> statement-breakpoint
-- 7. The three assessment columns. The jsonb default fills existing rows
-- with '{}' (no UPDATE; Postgres stores the default once).
ALTER TABLE operational_assessments
  ADD COLUMN IF NOT EXISTS actual_action text,
  ADD COLUMN IF NOT EXISTS supporting_evidence_url text,
  ADD COLUMN IF NOT EXISTS operational_constraint_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
-- 8. The two assessment CHECK rules (see the header).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operational_assessments_evidence_url_check'
      AND conrelid = 'public.operational_assessments'::regclass
  ) THEN
    ALTER TABLE operational_assessments
      ADD CONSTRAINT operational_assessments_evidence_url_check CHECK (
        supporting_evidence_url IS NULL
        OR (
          btrim(supporting_evidence_url) <> ''
          AND char_length(supporting_evidence_url) <= 2048
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'operational_assessments_constraint_notes_check'
      AND conrelid = 'public.operational_assessments'::regclass
  ) THEN
    ALTER TABLE operational_assessments
      ADD CONSTRAINT operational_assessments_constraint_notes_check CHECK (
        jsonb_typeof(operational_constraint_notes) = 'object'
      );
  END IF;
END
$$;
