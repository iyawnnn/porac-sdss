-- Catalog-safe summary before/after contraction. Source counts are printed under lock by 0050.
SELECT to_regclass('public.report_acknowledgments') IS NOT NULL legacy_table,
 to_regclass('public.acknowledgments') IS NOT NULL ticket_acknowledgments,
 to_regclass('public.report_acknowledgments_id_seq') IS NOT NULL legacy_sequence,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgenabled='O') append_only;
