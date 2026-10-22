-- Manuscript revision Phase 2, step 2d: before/after check for
-- 0038_ticket_acknowledgments.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the table exists, the source
--      counts, and the guard's counts (both must be 0 for the migration to
--      run);
--   2. reads acknowledgments, so run it only once the table exists (the
--      migrate script does exactly that). Expect 0 in
--      tickets_missing_row, rows_without_acknowledged_report and
--      rows_not_matching_earliest, and total_rows =
--      tickets_with_acknowledged_report. report_acknowledgments_not_copied is
--      informational: later acknowledgments on a ticket whose earliest one
--      was kept.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'acknowledgments'
  ) AS acknowledgments_table,
  (SELECT count(*) FROM report_acknowledgments)::int AS report_acknowledgments,
  (
    SELECT count(DISTINCT r.ticket_id)
    FROM report_acknowledgments ra
    JOIN reports r ON r.id = ra.report_id
  )::int AS tickets_with_acknowledged_report,
  (
    SELECT count(*) FROM report_acknowledgments ra
    WHERE ra.acknowledged_by_admin_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = ra.acknowledged_by_admin_id)
  )::int AS guard_without_admin,
  (
    SELECT count(*) FROM report_acknowledgments ra
    WHERE NOT EXISTS (
      SELECT 1 FROM reports r
      JOIN tickets t ON t.id = r.ticket_id
      WHERE r.id = ra.report_id
    )
  )::int AS guard_without_ticket;
--> statement-breakpoint
WITH earliest AS (
  SELECT DISTINCT ON (r.ticket_id)
    r.ticket_id, ra.id AS report_acknowledgment_id,
    ra.acknowledged_by_admin_id, ra.acknowledged_at
  FROM report_acknowledgments ra
  JOIN reports r ON r.id = ra.report_id
  ORDER BY r.ticket_id, ra.acknowledged_at, ra.id
)
SELECT
  (SELECT count(*) FROM acknowledgments)::int AS total_rows,
  (SELECT count(*) FROM earliest)::int AS tickets_with_acknowledged_report,
  (
    SELECT count(*) FROM earliest e
    WHERE NOT EXISTS (SELECT 1 FROM acknowledgments a WHERE a.ticket_id = e.ticket_id)
  )::int AS tickets_missing_row,
  (
    SELECT count(*) FROM acknowledgments a
    WHERE NOT EXISTS (SELECT 1 FROM earliest e WHERE e.ticket_id = a.ticket_id)
  )::int AS rows_without_acknowledged_report,
  (
    SELECT count(*) FROM acknowledgments a
    JOIN earliest e ON e.ticket_id = a.ticket_id
    WHERE a.acknowledged_by_admin_id IS DISTINCT FROM e.acknowledged_by_admin_id
      OR a.acknowledged_at IS DISTINCT FROM e.acknowledged_at
  )::int AS rows_not_matching_earliest,
  (
    SELECT count(*) FROM acknowledgments WHERE remarks IS NOT NULL
  )::int AS rows_with_remarks,
  (
    SELECT count(*) FROM report_acknowledgments ra
    WHERE NOT EXISTS (
      SELECT 1 FROM earliest e WHERE e.report_acknowledgment_id = ra.id
    )
  )::int AS report_acknowledgments_not_copied;
