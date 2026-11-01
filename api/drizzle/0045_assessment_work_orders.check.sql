-- Manuscript revision Phase 5, step 5b: before/after check for
-- 0045_assessment_work_orders.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: how many of the 7 new columns, 10 new
--      constraints (1 UNIQUE, 2 FKs, 7 CHECKs) and 1 new index exist (0 / 0
--      / 0 before, 7 / 10 / 1 after); Work Orders per status; the two counts
--      that must be 0 for the migration to run (completed_without_completed_at,
--      cancelled_with_completed_at) with the ids of the offending rows; how
--      many tickets have Work Orders but no assessment (they keep working:
--      the assessment rule applies to new Work Orders only).
--   2. reads the new columns, so run it only once they exist (the migrate
--      script does exactly that): cancelled Work Orders with and without
--      cancelled_at (legacy cancellations keep an empty reason), replacement
--      links, assessments with each new field, and two counts that must be 0
--      - check_rule_violations (rows breaking any new CHECK) and
--      replacements_on_another_ticket.
SELECT
  (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'work_orders' AND column_name IN (
          'cancellation_reason', 'cancelled_by_admin_id', 'cancelled_at',
          'replacement_work_order_id'
        ))
        OR (table_name = 'operational_assessments' AND column_name IN (
          'actual_action', 'supporting_evidence_url', 'operational_constraint_notes'
        ))
      )
  )::int AS new_columns,
  (
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'work_orders_cancelled_by_admin_id_fkey',
      'work_orders_id_ticket_id_unique',
      'work_orders_replacement_same_ticket_fkey',
      'work_orders_cancellation_check',
      'work_orders_cancellation_fields_check',
      'work_orders_replacement_not_self_check',
      'work_orders_completed_at_check',
      'work_orders_cancelled_not_completed_check',
      'operational_assessments_evidence_url_check',
      'operational_assessments_constraint_notes_check'
    )
  )::int AS new_constraints,
  (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND indexname = 'work_orders_replacement_work_order_id_idx'
  )::int AS new_indexes,
  (SELECT count(*) FROM work_orders)::int AS work_orders_total,
  (
    SELECT json_object_agg(k, n ORDER BY k)
    FROM (
      SELECT status::text AS k, count(*)::int AS n FROM work_orders GROUP BY 1
    ) g
  ) AS work_orders_by_status,
  (
    SELECT count(*) FROM work_orders
    WHERE status = 'completed' AND completed_at IS NULL
  )::int AS completed_without_completed_at,
  (
    SELECT count(*) FROM work_orders
    WHERE status = 'cancelled' AND completed_at IS NOT NULL
  )::int AS cancelled_with_completed_at,
  (
    SELECT json_agg(json_build_object(
      'id', id, 'ticket_id', ticket_id, 'status', status::text,
      'completed_at', completed_at
    ) ORDER BY id)
    FROM (
      SELECT id, ticket_id, status, completed_at FROM work_orders
      WHERE (status = 'completed' AND completed_at IS NULL)
        OR (status = 'cancelled' AND completed_at IS NOT NULL)
      ORDER BY id LIMIT 50
    ) bad
  ) AS blocking_rows_first_50,
  (
    SELECT count(DISTINCT w.ticket_id) FROM work_orders w
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_assessments a WHERE a.ticket_id = w.ticket_id
    )
  )::int AS tickets_with_work_orders_without_assessment,
  (SELECT count(*) FROM operational_assessments)::int AS assessments_total;
--> statement-breakpoint
SELECT
  (
    SELECT count(*) FROM work_orders
    WHERE status = 'cancelled' AND cancelled_at IS NOT NULL
  )::int AS cancelled_with_reason,
  (
    SELECT count(*) FROM work_orders
    WHERE status = 'cancelled' AND cancelled_at IS NULL
  )::int AS legacy_cancelled_without_reason,
  (
    SELECT count(*) FROM work_orders WHERE replacement_work_order_id IS NOT NULL
  )::int AS with_replacement,
  (
    SELECT count(*) FROM operational_assessments WHERE actual_action IS NOT NULL
  )::int AS assessments_with_actual_action,
  (
    SELECT count(*) FROM operational_assessments
    WHERE supporting_evidence_url IS NOT NULL
  )::int AS assessments_with_evidence_url,
  (
    SELECT count(*) FROM operational_assessments
    WHERE operational_constraint_notes <> '{}'::jsonb
  )::int AS assessments_with_constraint_notes,
  (
    (
      SELECT count(*) FROM work_orders
      WHERE NOT (
        (
          cancelled_at IS NULL
          OR (
            status = 'cancelled'
            AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''
            AND cancelled_by_admin_id IS NOT NULL
          )
        )
        AND (
          cancelled_at IS NOT NULL
          OR (
            cancellation_reason IS NULL
            AND cancelled_by_admin_id IS NULL
            AND replacement_work_order_id IS NULL
          )
        )
        AND (replacement_work_order_id IS NULL OR replacement_work_order_id <> id)
        AND (status <> 'completed' OR completed_at IS NOT NULL)
        AND (status <> 'cancelled' OR completed_at IS NULL)
      )
    )
    + (
      SELECT count(*) FROM operational_assessments
      WHERE NOT (
        (
          supporting_evidence_url IS NULL
          OR (
            btrim(supporting_evidence_url) <> ''
            AND char_length(supporting_evidence_url) <= 2048
          )
        )
        AND jsonb_typeof(operational_constraint_notes) = 'object'
      )
    )
  )::int AS check_rule_violations,
  (
    SELECT count(*) FROM work_orders w
    JOIN work_orders r ON r.id = w.replacement_work_order_id
    WHERE r.ticket_id <> w.ticket_id
  )::int AS replacements_on_another_ticket;
