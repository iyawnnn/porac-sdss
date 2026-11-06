-- Phase 7, step 7b-1: read-only before/after checks (same two-query pattern
-- as 0045/0046). Run query 2 only once new_columns = 1.
-- Query 1: column type/nullability/default, function, enabled row-level
-- BEFORE UPDATE OR DELETE trigger bound to that function, total rows and
-- a fingerprint of ALL historical values (excluding only the new column).
-- Compare audit_events_total and historical_values_fingerprint before/after:
-- both must be identical. On the first apply, query 2 must report all rows
-- with NULL and zero recorded values. On reruns, already-recorded true/false
-- values are valid and their counts must stay unchanged; never rewrite them.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events'
      AND column_name = 'actor_is_focal')::int AS new_columns,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events'
      AND column_name = 'actor_is_focal' AND data_type = 'boolean'
      AND is_nullable = 'YES' AND column_default IS NULL) AS nullable_boolean_no_default,
  (to_regprocedure('public.admin_audit_events_reject_update_delete()') IS NOT NULL)
    AS trigger_function_exists,
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.admin_audit_events'::regclass
      AND tgname = 'admin_audit_events_append_only' AND NOT tgisinternal)
    AS trigger_exists,
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.admin_audit_events'::regclass
      AND tgname = 'admin_audit_events_append_only' AND NOT tgisinternal
      AND tgenabled IN ('O', 'A') AND tgtype = 27
      AND tgfoid = to_regprocedure('public.admin_audit_events_reject_update_delete()'))
    AS trigger_enabled_before_update_delete_row,
  (SELECT count(*) FROM admin_audit_events)::int AS audit_events_total,
  (SELECT md5(coalesce(string_agg(md5((to_jsonb(e) - 'actor_is_focal')::text), '' ORDER BY id), ''))
    FROM admin_audit_events e) AS historical_values_fingerprint;
--> statement-breakpoint
SELECT
  count(*)::int AS audit_events_total,
  count(*) FILTER (WHERE actor_is_focal IS NULL)::int AS actor_focal_not_recorded,
  count(*) FILTER (WHERE actor_is_focal IS TRUE)::int AS actor_focal_true,
  count(*) FILTER (WHERE actor_is_focal IS FALSE)::int AS actor_focal_false
FROM admin_audit_events;
