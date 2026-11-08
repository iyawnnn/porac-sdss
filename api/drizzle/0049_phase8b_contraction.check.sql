-- Read-only catalog summary; safe on expanded, contracted and mixed states.
SELECT
 (SELECT count(*) FROM pg_attribute WHERE attnum>0 AND NOT attisdropped AND
   ((attrelid='public.reports'::regclass AND attname='elevation_m') OR
    (attrelid='public.tickets'::regclass AND attname IN ('elevation_m','elevation_factor','precipitation_factor','cluster_factor','urgency_score','urgency_band','priority_score','urgency_level'))))::int retired_columns,
 to_regclass('public.dem_points') IS NOT NULL terrain_exists,
 to_regclass('public.report_acknowledgments') IS NOT NULL report_acknowledgments_exist,
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.tickets'::regclass AND attname='priority_index' AND atttypid='integer'::regtype AND NOT attisdropped) operational_priority_exists,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgenabled='O') audit_protection_exists,
 (SELECT count(*) FROM pg_attribute WHERE attrelid='public.operational_assessments'::regclass AND attnum>0 AND NOT attisdropped AND attname LIKE 'legacy_%')::int legacy_columns,
 to_regclass('public.config') IS NOT NULL config_exists,
 to_regprocedure('public.admin_audit_events_fill_actor_account_type()') IS NOT NULL compatibility_function_exists,
 (SELECT count(*) FROM operational_assessments)::int assessments,
 (SELECT count(*) FROM work_orders)::int work_orders,
 (SELECT count(*) FROM admin_audit_events)::int audit_rows;
