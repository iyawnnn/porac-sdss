-- Manuscript revision Phase 2, step 2c: before/after check for
-- 0037_routing_actions.sql (read-only). Two queries, separated by the same
-- statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the table and enum exist, the
--      source row counts, and the guard's counts (all must be 0 for the
--      migration to run);
--   2. reads routing_actions, so run it only once the table exists (the
--      migrate script does exactly that). Expect 0 in
--      reassignments_without_routing_row, referrals_without_routing_row,
--      duplicate_key_groups and null_from_office, and
--      reassign_rows = office_reassignments, refer_rows = referral_events.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'routing_actions'
  ) AS routing_actions_table,
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'routing_action_type' AND typnamespace = 'public'::regnamespace
  ) AS routing_action_type_enum,
  (SELECT count(*) FROM office_reassignments)::int AS office_reassignments,
  (
    SELECT count(*) FROM admin_audit_events
    WHERE action_type = 'ticket_referral_noted' AND target_type = 'ticket'
  )::int AS referral_events,
  (
    SELECT count(*) FROM office_reassignments r
    WHERE r.admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = r.admin_id)
  )::int AS guard_reassignments_without_admin,
  (
    SELECT count(*) FROM admin_audit_events e
    WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
      AND (e.actor_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = e.actor_admin_id))
  )::int AS guard_referrals_without_admin,
  (
    (
      SELECT count(*) FROM office_reassignments r
      LEFT JOIN admins a ON a.id = r.admin_id
      WHERE length(COALESCE(r.admin_name, a.first_name || ' ' || a.last_name)) > 100
    ) + (
      SELECT count(*) FROM admin_audit_events e
      LEFT JOIN admins a ON a.id = e.actor_admin_id
      WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
        AND length(COALESCE(e.actor_name, a.first_name || ' ' || a.last_name)) > 100
    )
  )::int AS guard_admin_names_over_100,
  (
    SELECT count(*) FROM admin_audit_events e
    WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
      AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = e.target_id)
  )::int AS guard_referrals_without_ticket,
  (
    SELECT count(*) FROM admin_audit_events e
    WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
      AND length(e.metadata ->> 'agency') > 255
  )::int AS guard_agencies_over_255;
--> statement-breakpoint
WITH referral_sources AS (
  SELECT
    e.target_id AS ticket_id,
    COALESCE(
      (
        SELECT r.to_office
        FROM office_reassignments r
        WHERE r.ticket_id = e.target_id AND r.reassigned_at <= e.created_at
        ORDER BY r.reassigned_at DESC, r.id DESC
        LIMIT 1
      ),
      t.initial_assigned_office
    ) AS from_office,
    e.metadata ->> 'agency' AS referral_target,
    e.created_at
  FROM admin_audit_events e
  JOIN tickets t ON t.id = e.target_id
  WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
)
SELECT
  (SELECT count(*) FROM routing_actions)::int AS total_rows,
  (SELECT count(*) FROM routing_actions WHERE action_type = 'REASSIGN')::int AS reassign_rows,
  (SELECT count(*) FROM office_reassignments)::int AS office_reassignments,
  (SELECT count(*) FROM routing_actions WHERE action_type = 'REFER')::int AS refer_rows,
  (
    SELECT count(*) FROM admin_audit_events
    WHERE action_type = 'ticket_referral_noted' AND target_type = 'ticket'
  )::int AS referral_events,
  (
    SELECT count(*) FROM office_reassignments r
    WHERE NOT EXISTS (
      SELECT 1 FROM routing_actions ra
      WHERE ra.ticket_id = r.ticket_id
        AND ra.action_type = 'REASSIGN'
        AND ra.created_at = r.reassigned_at
        AND ra.from_office IS NOT DISTINCT FROM r.from_office
        AND ra.to_office IS NOT DISTINCT FROM r.to_office
        AND ra.referral_target IS NULL
    )
  )::int AS reassignments_without_routing_row,
  (
    SELECT count(*) FROM referral_sources src
    WHERE NOT EXISTS (
      SELECT 1 FROM routing_actions ra
      WHERE ra.ticket_id = src.ticket_id
        AND ra.action_type = 'REFER'
        AND ra.created_at = src.created_at
        AND ra.from_office IS NOT DISTINCT FROM src.from_office
        AND ra.to_office IS NULL
        AND ra.referral_target IS NOT DISTINCT FROM src.referral_target
    )
  )::int AS referrals_without_routing_row,
  (
    SELECT count(*) FROM (
      SELECT 1 FROM routing_actions
      GROUP BY ticket_id, action_type, created_at, from_office, to_office, referral_target
      HAVING count(*) > 1
    ) duplicates
  )::int AS duplicate_key_groups,
  (
    SELECT count(*) FROM routing_actions
    WHERE reason = 'Reason not recorded (before reasons were required)'
  )::int AS placeholder_reasons,
  (
    SELECT count(*) FROM routing_actions
    WHERE action_type = 'REFER' AND reason <> 'Reason not recorded (before reasons were required)'
  )::int AS refer_rows_with_note,
  (SELECT count(*) FROM routing_actions WHERE from_office IS NULL)::int AS null_from_office;
