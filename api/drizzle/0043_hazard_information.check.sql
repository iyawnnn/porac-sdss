-- Manuscript revision Phase 4, step 4b: before/after check for
-- 0043_hazard_information.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the two enums, the table, its
--      three CHECK rules and three indexes exist, and the ticket count;
--   2. reads the new table, so run it only once it exists (the migrate
--      script does exactly that): rows in total and current rows per
--      context type and status (0 right after the migration: nothing is
--      backfilled), and three counts that must be 0 — check_rule_violations
--      (rows breaking a CHECK rule), duplicate_current_rows ((ticket,
--      context type) pairs with more than one current row) and
--      current_rows_on_merged_away_tickets.
SELECT
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'hazard_context_type' AND typnamespace = 'public'::regnamespace
  ) AS hazard_context_type_enum,
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'hazard_lookup_status' AND typnamespace = 'public'::regnamespace
  ) AS hazard_lookup_status_enum,
  (to_regclass('public.hazard_information') IS NOT NULL) AS hazard_information_table,
  (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'hazard_information_classified_check',
      'hazard_information_no_classification_check',
      'hazard_information_unavailable_check'
    )
  )::int AS check_constraints,
  (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'hazard_information'
      AND indexname IN (
        'hazard_information_current_unique',
        'hazard_information_ticket_id_idx',
        'hazard_information_query_geom_idx'
      )
  )::int AS indexes,
  (SELECT count(*) FROM tickets)::int AS tickets_total;
--> statement-breakpoint
SELECT
  (SELECT count(*) FROM hazard_information)::int AS rows_total,
  (SELECT count(*) FROM hazard_information WHERE superseded_at IS NOT NULL)::int AS superseded_rows,
  (
    SELECT json_object_agg(k, n ORDER BY k)
    FROM (
      SELECT hazard_context_type::text || ' ' || lookup_status::text AS k, count(*)::int AS n
      FROM hazard_information WHERE superseded_at IS NULL GROUP BY 1
    ) g
  ) AS current_rows_by_context_and_status,
  (
    SELECT count(*) FROM hazard_information
    WHERE NOT (
      (lookup_status <> 'CLASSIFIED' OR susceptibility_code IS NOT NULL)
      AND (
        lookup_status <> 'NO_CLASSIFICATION'
        OR (susceptibility_code IS NULL AND susceptibility_label IS NULL)
      )
      AND (
        lookup_status <> 'TEMPORARILY_UNAVAILABLE'
        OR (
          failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
          AND susceptibility_code IS NULL AND susceptibility_label IS NULL
        )
      )
    )
  )::int AS check_rule_violations,
  (
    SELECT count(*) FROM (
      SELECT 1 FROM hazard_information WHERE superseded_at IS NULL
      GROUP BY ticket_id, hazard_context_type HAVING count(*) > 1
    ) d
  )::int AS duplicate_current_rows,
  (
    SELECT count(*) FROM hazard_information h
    JOIN tickets t ON t.id = h.ticket_id
    WHERE h.superseded_at IS NULL AND t.merged_into_ticket_id IS NOT NULL
  )::int AS current_rows_on_merged_away_tickets;
