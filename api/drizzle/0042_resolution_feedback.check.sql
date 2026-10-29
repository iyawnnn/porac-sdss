-- Manuscript revision Phase 3, step 3g: before/after check for
-- 0042_resolution_feedback.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the new type and table exist,
--      the old ticket-level feedback counts, the tickets the backfill
--      skips (merged-away, no report) and the guard's count (must be 0 for
--      the migration to run). tickets_old_feedback_to_copy is the number of
--      rows the first run inserts.
--   2. reads resolution_feedback, so run it only once the table exists (the
--      migrate script does exactly that): rows per feedback type, and
--      counts that must be 0 — disputed_without_reason,
--      confirmed_with_reason, duplicate_ticket_citizen_pairs,
--      tickets_old_feedback_missing_row, rows_on_merged_away_tickets,
--      orphan_ticket_ids, orphan_citizen_ids and
--      old_feedback_not_from_earliest_reporter. Informational:
--      tickets_old_feedback_skipped (= the skipped counts of query 1) and
--      old_confirmations_not_copied (tickets that were both confirmed and
--      disputed; only the dispute is copied).
SELECT
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'resolution_feedback_type' AND typnamespace = 'public'::regnamespace
  ) AS feedback_type_enum,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'resolution_feedback'
  ) AS resolution_feedback_table,
  (
    SELECT count(*) FROM tickets
    WHERE disputed_at IS NOT NULL OR resolution_confirmed_at IS NOT NULL
  )::int AS tickets_with_old_feedback,
  (SELECT count(*) FROM tickets WHERE disputed_at IS NOT NULL)::int AS old_disputed,
  (SELECT count(*) FROM tickets WHERE resolution_confirmed_at IS NOT NULL)::int AS old_confirmed,
  (
    SELECT count(*) FROM tickets
    WHERE disputed_at IS NOT NULL AND resolution_confirmed_at IS NOT NULL
  )::int AS old_confirmed_and_disputed,
  (
    SELECT count(*) FROM tickets
    WHERE (disputed_at IS NOT NULL OR resolution_confirmed_at IS NOT NULL)
      AND merged_into_ticket_id IS NOT NULL
  )::int AS skipped_merged_away,
  (
    SELECT count(*) FROM tickets t
    WHERE (t.disputed_at IS NOT NULL OR t.resolution_confirmed_at IS NOT NULL)
      AND t.merged_into_ticket_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id)
  )::int AS skipped_no_reporter,
  (
    SELECT count(*) FROM tickets t
    WHERE (t.disputed_at IS NOT NULL OR t.resolution_confirmed_at IS NOT NULL)
      AND t.merged_into_ticket_id IS NULL
      AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id)
  )::int AS tickets_old_feedback_to_copy,
  (
    SELECT count(*) FROM tickets t
    WHERE t.disputed_at IS NOT NULL
      AND t.merged_into_ticket_id IS NULL
      AND (t.dispute_reason IS NULL OR btrim(t.dispute_reason) = '')
      AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id)
  )::int AS guard_disputed_without_reason;
--> statement-breakpoint
WITH old_feedback AS (
  SELECT DISTINCT ON (t.id)
    t.id AS ticket_id, r.citizen_id AS earliest_citizen_id,
    CASE WHEN t.disputed_at IS NOT NULL THEN 'DISPUTED' ELSE 'CONFIRMED' END AS feedback_type
  FROM tickets t
  JOIN reports r ON r.ticket_id = t.id
  WHERE (t.disputed_at IS NOT NULL OR t.resolution_confirmed_at IS NOT NULL)
    AND t.merged_into_ticket_id IS NULL
  ORDER BY t.id, r.created_at, r.id
)
SELECT
  (SELECT count(*) FROM resolution_feedback)::int AS total_rows,
  (
    SELECT json_object_agg(feedback_type, n ORDER BY feedback_type)
    FROM (
      SELECT feedback_type::text AS feedback_type, count(*)::int AS n
      FROM resolution_feedback GROUP BY 1
    ) g
  ) AS rows_by_type,
  (
    SELECT count(*) FROM resolution_feedback
    WHERE feedback_type = 'DISPUTED' AND (reason IS NULL OR btrim(reason) = '')
  )::int AS disputed_without_reason,
  (
    SELECT count(*) FROM resolution_feedback
    WHERE feedback_type = 'CONFIRMED' AND reason IS NOT NULL
  )::int AS confirmed_with_reason,
  (
    SELECT count(*) FROM (
      SELECT ticket_id, citizen_id FROM resolution_feedback
      GROUP BY ticket_id, citizen_id HAVING count(*) > 1
    ) d
  )::int AS duplicate_ticket_citizen_pairs,
  (
    SELECT count(*) FROM old_feedback o
    WHERE NOT EXISTS (SELECT 1 FROM resolution_feedback f WHERE f.ticket_id = o.ticket_id)
  )::int AS tickets_old_feedback_missing_row,
  -- The earliest reporter's row on each copied ticket matches the old
  -- ticket-level type (rows from other citizens, written later by the app,
  -- are not compared).
  (
    SELECT count(*) FROM old_feedback o
    WHERE NOT EXISTS (
      SELECT 1 FROM resolution_feedback f
      WHERE f.ticket_id = o.ticket_id
        AND f.citizen_id = o.earliest_citizen_id
        AND f.feedback_type::text = o.feedback_type
    )
  )::int AS old_feedback_not_from_earliest_reporter,
  (
    SELECT count(*) FROM tickets t
    WHERE (t.disputed_at IS NOT NULL OR t.resolution_confirmed_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM old_feedback o WHERE o.ticket_id = t.id)
  )::int AS tickets_old_feedback_skipped,
  (
    SELECT count(*) FROM tickets
    WHERE disputed_at IS NOT NULL AND resolution_confirmed_at IS NOT NULL
      AND merged_into_ticket_id IS NULL
      AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = tickets.id)
  )::int AS old_confirmations_not_copied,
  (
    SELECT count(*) FROM resolution_feedback f
    JOIN tickets t ON t.id = f.ticket_id
    WHERE t.merged_into_ticket_id IS NOT NULL
  )::int AS rows_on_merged_away_tickets,
  (
    SELECT count(*) FROM resolution_feedback f
    WHERE NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = f.ticket_id)
  )::int AS orphan_ticket_ids,
  (
    SELECT count(*) FROM resolution_feedback f
    WHERE NOT EXISTS (SELECT 1 FROM citizens c WHERE c.id = f.citizen_id)
  )::int AS orphan_citizen_ids;
