-- Manuscript revision Phase 2, step 2e: before/after check for
-- 0039_staff_account_types.sql (read-only). Two queries, separated by the
-- same statement-breakpoint comment as the migration:
--   1. works BEFORE the migration: whether the new type, columns,
--      constraint and trigger exist, admins by role, the guard's counts
--      (all three must be 0 for the migration to run) and how many admins
--      have session_valid_after set (informational: the migration sets it
--      on every account it maps, which is the one-time logout);
--   2. reads the new columns, so run it only once they exist (the migrate
--      script does exactly that). Expect 0 in admins_mapping_mismatch,
--      check_rule_violations, focal_not_on_mdrrmo,
--      audit_null_actor_account_type and audit_mapping_mismatch.
SELECT
  EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'admin_account_type' AND typnamespace = 'public'::regnamespace
  ) AS account_type_enum,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'account_type'
  ) AS col_account_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admins' AND column_name = 'is_focal'
  ) AS col_is_focal,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events' AND column_name = 'actor_account_type'
  ) AS col_actor_account_type,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admins_account_type_office_focal_check'
  ) AS check_constraint,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'admin_audit_events_fill_actor_account_type' AND NOT tgisinternal
  ) AS fill_trigger,
  (SELECT count(*) FROM admins)::int AS admins_total,
  (
    SELECT json_object_agg(role, n ORDER BY role)
    FROM (SELECT role::text AS role, count(*)::int AS n FROM admins GROUP BY role) g
  ) AS admins_by_role,
  (
    SELECT count(*) FROM admins WHERE role IN ('officer', 'supervisor') AND office IS NULL
  )::int AS guard_personnel_without_office,
  (
    SELECT count(*) FROM admins WHERE role = 'focal' AND office = 'MEO'
  )::int AS guard_focal_on_meo,
  (
    SELECT count(*) FROM admins WHERE role = 'system_admin' AND office IS NOT NULL
  )::int AS guard_system_admin_with_office,
  (
    SELECT count(*) FROM admins WHERE session_valid_after IS NOT NULL
  )::int AS admins_with_session_valid_after,
  (SELECT count(*) FROM admin_audit_events)::int AS audit_events_total;
--> statement-breakpoint
SELECT
  (
    SELECT json_agg(g ORDER BY g.role, g.office NULLS FIRST)
    FROM (
      SELECT role::text AS role, account_type::text AS account_type, is_focal,
        office::text AS office, count(*)::int AS n
      FROM admins
      GROUP BY role, account_type, is_focal, office
    ) g
  ) AS admins_by_mapping,
  (
    SELECT count(*) FROM admins
    WHERE NOT COALESCE(
      CASE role
        WHEN 'officer' THEN account_type = 'PERSONNEL' AND is_focal = false AND office IS NOT NULL
        WHEN 'supervisor' THEN account_type = 'PERSONNEL' AND is_focal = false AND office IS NOT NULL
        WHEN 'focal' THEN account_type = 'PERSONNEL' AND is_focal = true AND office = 'MDRRMO'
        WHEN 'system_admin' THEN account_type = 'SYSTEM_ADMIN' AND is_focal = false AND office IS NULL
      END,
      false
    )
  )::int AS admins_mapping_mismatch,
  (
    SELECT count(*) FROM admins
    WHERE NOT COALESCE(
      (account_type = 'SYSTEM_ADMIN' AND office IS NULL AND is_focal = false)
      OR (account_type = 'PERSONNEL' AND office IS NOT NULL AND (is_focal = false OR office = 'MDRRMO')),
      false
    )
  )::int AS check_rule_violations,
  (
    SELECT count(*) FROM admins WHERE is_focal AND office IS DISTINCT FROM 'MDRRMO'
  )::int AS focal_not_on_mdrrmo,
  (
    SELECT json_agg(g ORDER BY g.actor_role, g.actor_account_type)
    FROM (
      SELECT actor_role::text AS actor_role, actor_account_type::text AS actor_account_type,
        count(*)::int AS n
      FROM admin_audit_events
      GROUP BY actor_role, actor_account_type
    ) g
  ) AS audit_by_role_and_type,
  (
    SELECT count(*) FROM admin_audit_events WHERE actor_account_type IS NULL
  )::int AS audit_null_actor_account_type,
  (
    SELECT count(*) FROM admin_audit_events
    WHERE actor_account_type IS DISTINCT FROM CASE actor_role
      WHEN 'officer' THEN 'PERSONNEL'
      WHEN 'supervisor' THEN 'PERSONNEL'
      WHEN 'focal' THEN 'PERSONNEL'
      WHEN 'system_admin' THEN 'SYSTEM_ADMIN'
    END::admin_account_type
  )::int AS audit_mapping_mismatch;
