-- Manuscript revision Phase 3, step 3f: before/after check for
-- 0041_severity_screening.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the new type, columns and
--      constraint exist, the report count, and the old report_intake_actions
--      'screened' rows (informational: kept as history, never written again,
--      and they give no report a screening);
--   2. reads the new columns, so run it only once they exist (the migrate
--      script does exactly that): reports per screening status, and two
--      counts that must be 0 — check_rule_violations (rows breaking the
--      CHECK rule) and remarks_without_screening (remarks on a NOT_REVIEWED
--      report).
SELECT
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'severity_screening_status' AND typnamespace = 'public'::regnamespace
  ) AS screening_status_enum,
  (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports'
      AND column_name IN (
        'severity_screening_status', 'severity_screening_remarks',
        'severity_screened_by_admin_id', 'severity_screened_at'
      )
  )::int AS screening_columns,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_severity_screening_consistency_check'
  ) AS check_constraint,
  (SELECT count(*) FROM reports)::int AS reports_total,
  (
    SELECT count(*) FROM report_intake_actions WHERE action_type = 'screened'
  )::int AS old_screened_actions,
  (
    SELECT count(DISTINCT report_id) FROM report_intake_actions WHERE action_type = 'screened'
  )::int AS reports_with_old_screened_actions;
--> statement-breakpoint
SELECT
  (
    SELECT json_object_agg(status, n ORDER BY status)
    FROM (
      SELECT severity_screening_status::text AS status, count(*)::int AS n
      FROM reports GROUP BY 1
    ) g
  ) AS reports_by_status,
  (
    SELECT count(*) FROM reports
    WHERE NOT (
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
    )
  )::int AS check_rule_violations,
  (
    SELECT count(*) FROM reports
    WHERE severity_screening_status = 'NOT_REVIEWED'
      AND severity_screening_remarks IS NOT NULL
  )::int AS remarks_without_screening;
