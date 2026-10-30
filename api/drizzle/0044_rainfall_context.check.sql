-- Manuscript revision Phase 4, step 4c: before/after check for
-- 0044_rainfall_context.sql (read-only). Two queries, separated by the same
-- statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the enum, the table, its three
--      CHECK rules and three indexes exist, and the ticket count;
--   2. reads the new table, so run it only once it exists (the migrate
--      script does exactly that): rows in total and current rows per status
--      (0 right after the migration: nothing is backfilled), and three counts
--      that must be 0 - check_rule_violations (rows breaking a CHECK rule),
--      duplicate_current_rows (tickets with more than one current row) and
--      current_rows_on_merged_away_tickets.
SELECT
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'rainfall_context_status' AND typnamespace = 'public'::regnamespace
  ) AS rainfall_context_status_enum,
  (to_regclass('public.rainfall_context') IS NOT NULL) AS rainfall_context_table,
  (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'rainfall_context_current_check',
      'rainfall_context_stale_check',
      'rainfall_context_unavailable_check'
    )
  )::int AS check_constraints,
  (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'rainfall_context'
      AND indexname IN (
        'rainfall_context_current_unique',
        'rainfall_context_ticket_id_idx',
        'rainfall_context_query_geom_idx'
      )
  )::int AS indexes,
  (SELECT count(*) FROM tickets)::int AS tickets_total;
--> statement-breakpoint
SELECT
  (SELECT count(*) FROM rainfall_context)::int AS rows_total,
  (SELECT count(*) FROM rainfall_context WHERE superseded_at IS NOT NULL)::int AS superseded_rows,
  (
    SELECT json_object_agg(k, n ORDER BY k)
    FROM (
      SELECT status::text AS k, count(*)::int AS n
      FROM rainfall_context WHERE superseded_at IS NULL GROUP BY 1
    ) g
  ) AS current_rows_by_status,
  (
    SELECT count(*) FROM rainfall_context
    WHERE NOT (
      (
        status <> 'CURRENT'
        OR (
          rainfall_mm IS NOT NULL AND rainfall_mm >= 0 AND rainfall_mm < 'Infinity'::real
          AND failure_reason IS NULL
        )
      )
      AND (
        status <> 'STALE'
        OR (
          rainfall_mm IS NOT NULL AND rainfall_mm >= 0 AND rainfall_mm < 'Infinity'::real
          AND failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
        )
      )
      AND (
        status <> 'UNAVAILABLE'
        OR (
          rainfall_mm IS NULL
          AND failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
        )
      )
    )
  )::int AS check_rule_violations,
  (
    SELECT count(*) FROM (
      SELECT 1 FROM rainfall_context WHERE superseded_at IS NULL
      GROUP BY ticket_id HAVING count(*) > 1
    ) d
  )::int AS duplicate_current_rows,
  (
    SELECT count(*) FROM rainfall_context r
    JOIN tickets t ON t.id = r.ticket_id
    WHERE r.superseded_at IS NULL AND t.merged_into_ticket_id IS NOT NULL
  )::int AS current_rows_on_merged_away_tickets;
