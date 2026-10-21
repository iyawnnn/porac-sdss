-- Manuscript revision Phase 2, step 2b: before/after check for
-- 0036_ticket_report_fields.sql. Two queries, separated by the same
-- statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: which of the five columns (and the
--      triggers and unique index) exist, plus row counts from existing
--      columns only;
--   2. reads the new columns, so run it only once all five exist (the
--      migrate script does exactly that). Expect 0 NULLs in the three NOT
--      NULL columns, 0 duplicate tracking references and 0 Resolved tickets
--      without an outcome.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'tracking_reference'
  ) AS col_reports_tracking_reference,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'submitted_category'
  ) AS col_reports_submitted_category,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'initial_assigned_office'
  ) AS col_tickets_initial_assigned_office,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'resolution_outcome'
  ) AS col_tickets_resolution_outcome,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'merged_into_ticket_id'
  ) AS col_tickets_merged_into_ticket_id,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'reports_fill_intake_fields' AND NOT tgisinternal
  ) AS reports_insert_trigger,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tickets_fill_initial_assigned_office' AND NOT tgisinternal
  ) AS tickets_insert_trigger,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'reports_tracking_reference_unique'
  ) AS tracking_reference_unique_index,
  (SELECT count(*) FROM tickets)::int AS tickets_total,
  (SELECT count(*) FROM reports)::int AS reports_total,
  (SELECT count(*) FROM tickets WHERE status = 'Resolved')::int AS tickets_resolved,
  (SELECT count(DISTINCT ticket_id) FROM office_reassignments)::int AS tickets_reassigned;
--> statement-breakpoint
SELECT
  (SELECT count(*) FROM reports WHERE tracking_reference IS NULL)::int AS null_tracking_reference,
  (SELECT count(*) FROM reports WHERE submitted_category IS NULL)::int AS null_submitted_category,
  (SELECT count(*) FROM tickets WHERE initial_assigned_office IS NULL)::int AS null_initial_assigned_office,
  (SELECT count(*) FROM tickets WHERE resolution_outcome IS NULL)::int AS null_resolution_outcome,
  (SELECT count(*) FROM tickets WHERE merged_into_ticket_id IS NULL)::int AS null_merged_into_ticket_id,
  (
    SELECT count(*) FROM (
      SELECT tracking_reference FROM reports
      WHERE tracking_reference IS NOT NULL
      GROUP BY tracking_reference
      HAVING count(*) > 1
    ) duplicates
  )::int AS duplicate_tracking_references,
  (SELECT count(*) FROM tickets WHERE resolution_outcome = 'MUNICIPAL_ACTION_COMPLETED')::int AS outcome_municipal_action_completed,
  (SELECT count(*) FROM tickets WHERE resolution_outcome = 'EXTERNAL_REFERRAL')::int AS outcome_external_referral,
  (SELECT count(*) FROM tickets WHERE status = 'Resolved' AND resolution_outcome IS NULL)::int AS resolved_without_outcome,
  (SELECT count(*) FROM tickets WHERE initial_assigned_office IS DISTINCT FROM assigned_office)::int AS initial_office_differs;
