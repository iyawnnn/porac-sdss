-- Manuscript revision Phase 5, step 5c (step 1 of 2): before/after check for
-- 0046_resolution_record.sql (read-only). Two queries, separated by the same
-- statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: how many of the 7 new columns, 6 new
--      CHECKs and 1 new FK exist (0 / 0 / 0 before, 7 / 6 / 1 after);
--      tickets per status; Resolved tickets with and without an outcome and
--      with blank notes (legacy rows, all left as they are); the count that
--      must be 0 for the migration to run (outcome_on_non_resolved) with the
--      ids of the offending tickets; status_history rows in total and
--      Resolved rows.
--   2. reads the new columns, so run it only once they exist (the migrate
--      script does exactly that): Resolved tickets with and without
--      resolved_at (every legacy one is without), status_history rows using
--      each new column, and check_rule_violations (rows breaking any of the
--      six new CHECKs), which must be 0.
SELECT
  (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'tickets' AND column_name IN (
          'resolved_at', 'resolved_by_admin_id'
        ))
        OR (table_name = 'status_history' AND column_name IN (
          'from_status', 'reason', 'resolution_outcome', 'resolution_notes',
          'resolution_image_url'
        ))
      )
  )::int AS new_columns,
  (
    SELECT count(*) FROM pg_constraint
    WHERE contype = 'c'
      AND conname IN (
        'tickets_resolved_at_status_check',
        'tickets_resolution_record_check',
        'tickets_resolution_outcome_status_check',
        'status_history_resolution_snapshot_check',
        'status_history_return_reason_check',
        'status_history_reason_nonblank_check'
      )
  )::int AS new_constraints,
  (
    SELECT count(*) FROM pg_constraint
    WHERE contype = 'f' AND conname = 'tickets_resolved_by_admin_id_fkey'
  )::int AS new_foreign_keys,
  (SELECT count(*) FROM tickets)::int AS tickets_total,
  (
    SELECT json_object_agg(k, n ORDER BY k)
    FROM (
      SELECT status::text AS k, count(*)::int AS n FROM tickets GROUP BY 1
    ) g
  ) AS tickets_by_status,
  (SELECT count(*) FROM tickets WHERE status = 'Resolved')::int AS tickets_resolved_total,
  (
    SELECT count(*) FROM tickets
    WHERE status = 'Resolved' AND resolution_outcome IS NOT NULL
  )::int AS resolved_with_outcome,
  (
    SELECT count(*) FROM tickets
    WHERE status = 'Resolved' AND resolution_outcome IS NULL
  )::int AS resolved_without_outcome,
  (
    SELECT count(*) FROM tickets
    WHERE status = 'Resolved' AND btrim(coalesce(resolution_notes, '')) = ''
  )::int AS resolved_with_blank_notes,
  (
    SELECT count(*) FROM tickets
    WHERE resolution_outcome IS NOT NULL AND status <> 'Resolved'
  )::int AS outcome_on_non_resolved,
  (
    SELECT json_agg(json_build_object(
      'id', id, 'status', status::text, 'resolution_outcome', resolution_outcome::text
    ) ORDER BY id)
    FROM (
      SELECT id, status, resolution_outcome FROM tickets
      WHERE resolution_outcome IS NOT NULL AND status <> 'Resolved'
      ORDER BY id LIMIT 50
    ) bad
  ) AS blocking_rows_first_50,
  (SELECT count(*) FROM status_history)::int AS status_history_total,
  (
    SELECT count(*) FROM status_history WHERE status = 'Resolved'
  )::int AS status_history_resolved_rows;
--> statement-breakpoint
SELECT
  (SELECT count(*) FROM tickets WHERE status = 'Resolved')::int AS tickets_resolved_total,
  (SELECT count(*) FROM tickets WHERE resolved_at IS NOT NULL)::int AS tickets_with_resolved_at,
  (
    SELECT count(*) FROM tickets
    WHERE status = 'Resolved' AND resolved_at IS NULL
  )::int AS legacy_resolved_without_resolved_at,
  (
    SELECT count(*) FROM status_history WHERE from_status IS NOT NULL
  )::int AS status_history_with_from_status,
  (
    SELECT count(*) FROM status_history WHERE reason IS NOT NULL
  )::int AS status_history_with_reason,
  (
    SELECT count(*) FROM status_history
    WHERE resolution_outcome IS NOT NULL
      OR resolution_notes IS NOT NULL
      OR resolution_image_url IS NOT NULL
  )::int AS status_history_with_snapshot,
  (
    SELECT count(*) FROM status_history
    WHERE from_status = 'Resolved' AND status = 'Under Review'
  )::int AS status_history_returns,
  -- A CHECK passes when its expression is NULL, so each rule is wrapped in
  -- coalesce(..., true): a row counts only when a rule is actually false.
  (
    (
      SELECT count(*) FROM tickets
      WHERE NOT (
        coalesce(resolved_at IS NULL OR status = 'Resolved', true)
        AND coalesce(
          resolved_at IS NULL
          OR (
            resolution_outcome IS NOT NULL
            AND resolved_by_admin_id IS NOT NULL
            AND btrim(coalesce(resolution_notes, '')) <> ''
          ),
          true
        )
        AND coalesce(resolution_outcome IS NULL OR status = 'Resolved', true)
      )
    )
    + (
      SELECT count(*) FROM status_history
      WHERE NOT (
        coalesce(
          (
            resolution_outcome IS NULL
            AND resolution_notes IS NULL
            AND resolution_image_url IS NULL
          )
          OR status = 'Resolved',
          true
        )
        AND coalesce(
          NOT (from_status = 'Resolved' AND status = 'Under Review')
          OR btrim(coalesce(reason, '')) <> '',
          true
        )
        AND coalesce(reason IS NULL OR btrim(reason) <> '', true)
      )
    )
  )::int AS check_rule_violations;
