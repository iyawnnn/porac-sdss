-- 0049: Phase 8b-1. ONE transaction through migrate:contraction.
-- Recovery: operator-created Neon branch backup. No CSV or historical audit writes.
-- Lock order: (8048,1), then (8049,1), then tables below. No removed object is recreated.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;
DO $contraction$
DECLARE
  item record; entry jsonb; present integer; expanded boolean; pass integer; summary jsonb;
  snapshot_before jsonb; snapshot_value jsonb; target record; dependency record;
BEGIN
  PERFORM pg_advisory_xact_lock(8048,1);
  PERFORM pg_advisory_xact_lock(8049,1);
  -- Stop writes during fingerprinting and reject quickly rather than wait indefinitely.
  LOCK TABLE public.admins,public.admin_audit_events,public.dem_points,public.report_acknowledgments,public.work_orders IN SHARE MODE;
  LOCK TABLE public.operational_assessments,public.reports,public.tickets IN ACCESS EXCLUSIVE MODE;
  FOR pass IN 1..2 LOOP
    -- BEGIN SHARED SURVIVOR VERIFIER
DECLARE
  expected jsonb := '[{"table":"operational_assessments","name":"actual_action","type":"text","required":false,"default":null},{"table":"operational_assessments","name":"assessed_by_admin_id","type":"integer","required":true,"default":null},{"table":"operational_assessments","name":"assessed_by_name","type":"text","required":false,"default":null},{"table":"operational_assessments","name":"assessed_conditions","type":"text","required":true,"default":"''''::text"},{"table":"operational_assessments","name":"created_at","type":"timestamp with time zone","required":true,"default":"now()"},{"table":"operational_assessments","name":"deferment_or_referral_reason","type":"text","required":false,"default":null},{"table":"operational_assessments","name":"id","type":"integer","required":true,"default":"nextval(''operational_assessments_id_seq''::regclass)"},{"table":"operational_assessments","name":"interim_mitigation","type":"text","required":true,"default":"''''::text"},{"table":"operational_assessments","name":"operational_constraints","type":"jsonb","required":true,"default":"''{\"notes\": {}, \"selected\": []}''::jsonb"},{"table":"operational_assessments","name":"recommended_action","type":"text","required":true,"default":"''''::text"},{"table":"operational_assessments","name":"remarks","type":"text","required":false,"default":null},{"table":"operational_assessments","name":"safety_implications","type":"text","required":true,"default":"''''::text"},{"table":"operational_assessments","name":"supporting_evidence_url","type":"text","required":false,"default":null},{"table":"operational_assessments","name":"ticket_id","type":"integer","required":true,"default":null},{"table":"operational_assessments","name":"updated_at","type":"timestamp with time zone","required":true,"default":"now()"},{"table":"operational_assessments","name":"updated_by_admin_id","type":"integer","required":false,"default":null},{"table":"operational_assessments","name":"updated_by_name","type":"text","required":false,"default":null},{"table":"work_orders","name":"assigned_admin_id","type":"integer","required":false,"default":null},{"table":"work_orders","name":"assigned_office","type":"office","required":true,"default":null},{"table":"work_orders","name":"cancellation_reason","type":"text","required":false,"default":null},{"table":"work_orders","name":"cancelled_at","type":"timestamp with time zone","required":false,"default":null},{"table":"work_orders","name":"cancelled_by_admin_id","type":"integer","required":false,"default":null},{"table":"work_orders","name":"completed_at","type":"timestamp with time zone","required":false,"default":null},{"table":"work_orders","name":"created_at","type":"timestamp with time zone","required":true,"default":"now()"},{"table":"work_orders","name":"created_by_admin_id","type":"integer","required":true,"default":null},{"table":"work_orders","name":"due_date","type":"timestamp with time zone","required":false,"default":null},{"table":"work_orders","name":"id","type":"integer","required":true,"default":"nextval(''work_orders_id_seq''::regclass)"},{"table":"work_orders","name":"notes","type":"text","required":false,"default":null},{"table":"work_orders","name":"replacement_work_order_id","type":"integer","required":false,"default":null},{"table":"work_orders","name":"status","type":"work_order_status","required":true,"default":"''pending''::work_order_status"},{"table":"work_orders","name":"ticket_id","type":"integer","required":true,"default":null},{"table":"work_orders","name":"title","type":"text","required":true,"default":null},{"table":"work_orders","name":"updated_at","type":"timestamp with time zone","required":true,"default":"now()"}]'::jsonb;
  item jsonb; found_record record; legacy_count integer;
BEGIN
  SELECT count(*) INTO legacy_count FROM pg_attribute WHERE attrelid='public.operational_assessments'::regclass AND attnum>0 AND NOT attisdropped AND attname LIKE 'legacy_%';
  IF legacy_count NOT IN (0,4) THEN RAISE EXCEPTION '0049 mixed assessment legacy state'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) def INTO found_record
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=('public.' || (item->>'table'))::regclass AND a.attname=item->>'name' AND a.attnum>0 AND NOT a.attisdropped;
    IF NOT FOUND OR found_record.type IS DISTINCT FROM item->>'type' OR found_record.required IS DISTINCT FROM (item->>'required')::boolean
      OR found_record.def IS DISTINCT FROM item->>'default' THEN RAISE EXCEPTION '0049 surviving column/type/nullability/default mismatch: %.%',item->>'table',item->>'name'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.operational_assessments'::regclass AND attnum>0 AND NOT attisdropped) <> 17+legacy_count THEN
    RAISE EXCEPTION '0049 unexpected assessment columns'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements('[{"tbl":"operational_assessments","conname":"operational_assessments_assessed_by_admin_id_fkey","contype":"f","def":"FOREIGN KEY (assessed_by_admin_id) REFERENCES admins(id) ON DELETE RESTRICT"},{"tbl":"operational_assessments","conname":"operational_assessments_constraints_shape_check","contype":"c","def":"CHECK (((jsonb_typeof(operational_constraints) = ''object''::text) AND (operational_constraints ?& ARRAY[''selected''::text, ''notes''::text]) AND (jsonb_typeof((operational_constraints -> ''selected''::text)) = ''array''::text) AND (jsonb_typeof((operational_constraints -> ''notes''::text)) = ''object''::text)))"},{"tbl":"operational_assessments","conname":"operational_assessments_evidence_url_check","contype":"c","def":"CHECK (((supporting_evidence_url IS NULL) OR ((btrim(supporting_evidence_url) <> ''''::text) AND (char_length(supporting_evidence_url) <= 2048))))"},{"tbl":"operational_assessments","conname":"operational_assessments_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"tbl":"operational_assessments","conname":"operational_assessments_ticket_id_fkey","contype":"f","def":"FOREIGN KEY (ticket_id) REFERENCES tickets(id)"},{"tbl":"operational_assessments","conname":"operational_assessments_ticket_id_key","contype":"u","def":"UNIQUE (ticket_id)"},{"tbl":"work_orders","conname":"work_orders_cancellation_check","contype":"c","def":"CHECK (((cancelled_at IS NULL) OR ((status = ''cancelled''::work_order_status) AND (cancellation_reason IS NOT NULL) AND (btrim(cancellation_reason) <> ''''::text) AND (cancelled_by_admin_id IS NOT NULL))))"},{"tbl":"work_orders","conname":"work_orders_cancellation_fields_check","contype":"c","def":"CHECK (((cancelled_at IS NOT NULL) OR ((cancellation_reason IS NULL) AND (cancelled_by_admin_id IS NULL) AND (replacement_work_order_id IS NULL))))"},{"tbl":"work_orders","conname":"work_orders_cancelled_by_admin_id_fkey","contype":"f","def":"FOREIGN KEY (cancelled_by_admin_id) REFERENCES admins(id)"},{"tbl":"work_orders","conname":"work_orders_cancelled_not_completed_check","contype":"c","def":"CHECK (((status <> ''cancelled''::work_order_status) OR (completed_at IS NULL)))"},{"tbl":"work_orders","conname":"work_orders_completed_at_check","contype":"c","def":"CHECK (((status <> ''completed''::work_order_status) OR (completed_at IS NOT NULL)))"},{"tbl":"work_orders","conname":"work_orders_id_ticket_id_unique","contype":"u","def":"UNIQUE (id, ticket_id)"},{"tbl":"work_orders","conname":"work_orders_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"tbl":"work_orders","conname":"work_orders_replacement_not_self_check","contype":"c","def":"CHECK (((replacement_work_order_id IS NULL) OR (replacement_work_order_id <> id)))"},{"tbl":"work_orders","conname":"work_orders_replacement_same_ticket_fkey","contype":"f","def":"FOREIGN KEY (replacement_work_order_id, ticket_id) REFERENCES work_orders(id, ticket_id)"},{"tbl":"work_orders","conname":"work_orders_ticket_id_fkey","contype":"f","def":"FOREIGN KEY (ticket_id) REFERENCES tickets(id)"}]'::jsonb) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=('public.' || (item->>'tbl'))::regclass AND conname=item->>'conname'
      AND contype::text=item->>'contype' AND convalidated AND NOT condeferrable
      AND pg_get_constraintdef(oid)=item->>'def') THEN RAISE EXCEPTION '0049 surviving constraint mismatch: %',item->>'conname'; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='work_orders_replacement_work_order_id_idx'
    AND i.indrelid='public.work_orders'::regclass AND i.indisvalid AND i.indisready AND NOT i.indisunique
    AND pg_get_indexdef(i.indexrelid)='CREATE INDEX work_orders_replacement_work_order_id_idx ON public.work_orders USING btree (replacement_work_order_id) WHERE (replacement_work_order_id IS NOT NULL)') THEN
    RAISE EXCEPTION '0049 Work Order replacement index mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.operational_assessments a WHERE assessed_by_admin_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admins d WHERE d.id=a.assessed_by_admin_id)
    OR jsonb_typeof(operational_constraints) IS DISTINCT FROM 'object'
    OR NOT (operational_constraints ?& ARRAY['selected','notes'])
    OR jsonb_typeof(operational_constraints->'selected') IS DISTINCT FROM 'array'
    OR jsonb_typeof(operational_constraints->'notes') IS DISTINCT FROM 'object') THEN RAISE EXCEPTION '0049 invalid surviving assessment data'; END IF;
  IF EXISTS(SELECT 1 FROM public.operational_assessments a WHERE
    EXISTS(SELECT 1 FROM jsonb_array_elements(operational_constraints->'selected') x WHERE jsonb_typeof(x)<>'string')
    OR EXISTS(SELECT 1 FROM jsonb_each(operational_constraints->'notes') n WHERE jsonb_typeof(n.value)<>'string' OR NOT ((operational_constraints->'selected') ? n.key))) THEN
    RAISE EXCEPTION '0049 invalid surviving assessment JSON entries'; END IF;
  IF legacy_count=0 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass
    AND (conname='operational_assessments_constraint_notes_check' OR (contype='n' AND conname IN ('operational_assessments_observed_conditions_not_null','operational_assessments_temporary_mitigation_not_null','operational_assessments_assessed_at_not_null','operational_assessments_operational_constraints_not_null1')))) THEN
    RAISE EXCEPTION '0049 unfinished constraint contraction'; END IF;
END;
-- END SHARED SURVIVOR VERIFIER
    SELECT count(*) INTO present FROM pg_attribute WHERE attrelid='public.operational_assessments'::regclass AND attnum>0 AND NOT attisdropped AND attname=ANY(ARRAY['legacy_deferment_reason','legacy_referral_reason','legacy_operational_constraints','legacy_operational_constraint_notes']);
    expanded := present=4;
    IF present NOT IN (0,4) THEN RAISE EXCEPTION '0049 mixed assessment state'; END IF;
    IF pass=2 AND expanded THEN RAISE EXCEPTION '0049 did not reach final state'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements('[["reports","elevation_m","real"],["tickets","elevation_m","real"],["tickets","elevation_factor","real"],["tickets","precipitation_factor","real"],["tickets","cluster_factor","real"],["tickets","urgency_score","real"],["tickets","urgency_band","text"],["tickets","priority_score","integer"],["tickets","urgency_level","text"]]'::jsonb) LOOP
      SELECT a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) def INTO item
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=('public.'||(entry->>0))::regclass AND a.attname=entry->>1 AND a.attnum>0 AND NOT a.attisdropped;
      IF expanded THEN
        IF NOT FOUND OR item.type IS DISTINCT FROM entry->>2 OR item.attnotnull OR item.def IS NOT NULL THEN RAISE EXCEPTION '0049 retired column mismatch: %',entry; END IF;
      ELSIF FOUND THEN RAISE EXCEPTION '0049 mixed retired columns'; END IF;
    END LOOP;
    IF (to_regclass('public.config') IS NOT NULL) IS DISTINCT FROM expanded
      OR (to_regprocedure('public.admin_audit_events_fill_actor_account_type()') IS NOT NULL) IS DISTINCT FROM expanded
      OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_fill_actor_account_type') IS DISTINCT FROM expanded THEN
      RAISE EXCEPTION '0049 mixed config/compatibility state'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.admins'::regclass AND conname='admins_account_type_office_focal_check' AND convalidated
      AND pg_get_constraintdef(oid)='CHECK ((((account_type = ''SYSTEM_ADMIN''::admin_account_type) AND (office IS NULL) AND (is_focal = false)) OR ((account_type = ''PERSONNEL''::admin_account_type) AND (office IS NOT NULL) AND ((is_focal = false) OR (office = ''MDRRMO''::office)))))')
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admins'::regclass AND attname='account_type' AND atttypid='public.admin_account_type'::regtype AND attnotnull)
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admins'::regclass AND attname='is_focal' AND atttypid='boolean'::regtype AND attnotnull)
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admins'::regclass AND attname='role' AND atttypid='public.admin_role'::regtype AND attnotnull)
      THEN RAISE EXCEPTION '0049 staff type/mapping constraint mismatch'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.tickets'::regclass AND a.attname='priority_index' AND a.atttypid='integer'::regtype
        AND NOT a.attnotnull AND NOT a.attisdropped AND d.oid IS NULL) THEN RAISE EXCEPTION '0049 Operational Priority definition mismatch'; END IF;
    -- Both states require the exact 0047 enforcement and permanent role history.
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgtype=27 AND tgenabled='O' AND tgfoid=to_regprocedure('public.admin_audit_events_reject_update_delete()') AND tgqual IS NULL AND tgnargs=0)
      OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_audit_events_reject_update_delete()') AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace('
BEGIN
  RAISE EXCEPTION ''admin_audit_events is append-only: UPDATE and DELETE are not allowed'';
END
','[[:space:]]','','g') AND l.lanname='plpgsql' AND NOT p.prosecdef AND p.proconfig IS NULL AND p.prorettype='trigger'::regtype AND p.prokind='f' AND p.pronargs=0 AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u')
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admin_audit_events'::regclass AND attname='actor_role' AND atttypid='public.admin_role'::regtype AND attnotnull)
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admin_audit_events'::regclass AND attname='actor_account_type' AND atttypid='public.admin_account_type'::regtype AND attnotnull) THEN RAISE EXCEPTION '0049 audit protection/type mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
      AND p.oid IS DISTINCT FROM to_regprocedure('public.admin_audit_events_fill_actor_account_type()')
      AND p.prosrc ~* '\m(elevation_m|elevation_factor|precipitation_factor|cluster_factor|urgency_score|urgency_band|priority_score|urgency_level|legacy_deferment_reason|legacy_referral_reason|legacy_operational_constraints|legacy_operational_constraint_notes|config|admin_audit_events_fill_actor_account_type)\M') THEN
      RAISE EXCEPTION '0049 function source references a retired object'; END IF;
    SELECT jsonb_build_object(
 'audit_rows',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.admin_audit_events x),
 'dem_rows',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.dem_points x),
 'ack_rows',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.report_acknowledgments x),
 'assessments',(SELECT md5(coalesce(string_agg((to_jsonb(x)-ARRAY['legacy_deferment_reason','legacy_referral_reason','legacy_operational_constraints','legacy_operational_constraint_notes'])::text,'' ORDER BY id),'')) FROM public.operational_assessments x),
 'work_orders',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.work_orders x),
 'tickets',(SELECT md5(coalesce(string_agg((to_jsonb(x)-ARRAY['elevation_m','elevation_factor','precipitation_factor','cluster_factor','urgency_score','urgency_band','priority_score','urgency_level'])::text,'' ORDER BY id),'')) FROM public.tickets x),
 'reports',(SELECT md5(coalesce(string_agg((to_jsonb(x)-'elevation_m')::text,'' ORDER BY id),'')) FROM public.reports x),
 'admin_rows',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.admins x),
 'protected_columns',(SELECT md5(coalesce(string_agg(jsonb_build_array(a.attrelid,a.attname,a.atttypid,a.atttypmod,a.attnotnull,pg_get_expr(d.adbin,d.adrelid))::text,'' ORDER BY a.attrelid,a.attnum),'')) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN ('public.dem_points'::regclass,'public.report_acknowledgments'::regclass,'public.admin_audit_events'::regclass,'public.admins'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
 'protected_constraints',(SELECT md5(coalesce(string_agg(pg_get_constraintdef(oid),'' ORDER BY conrelid,conname),'')) FROM pg_constraint WHERE conrelid IN ('public.dem_points'::regclass,'public.report_acknowledgments'::regclass,'public.admin_audit_events'::regclass,'public.admins'::regclass)),
 'role_enum',(SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.admin_role'::regtype),
 'protected_catalog',(SELECT md5(coalesce(string_agg(pg_describe_object('pg_class'::regclass,c.oid,0)||pg_get_indexdef(i.indexrelid),'' ORDER BY c.oid,i.indexrelid),'')) FROM pg_class c LEFT JOIN pg_index i ON i.indrelid=c.oid WHERE c.oid IN ('public.dem_points'::regclass,'public.report_acknowledgments'::regclass)),
 'audit_trigger',(SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only'),
 'audit_function',pg_get_functiondef('public.admin_audit_events_reject_update_delete()'::regprocedure)) INTO snapshot_value;
    IF pass=2 AND snapshot_value IS DISTINCT FROM snapshot_before THEN RAISE EXCEPTION '0049 protected data or definitions changed'; END IF;
    IF NOT expanded THEN
      IF pass=1 THEN RAISE NOTICE '0049 final state verified; no changes';
      ELSE RAISE NOTICE '0049 contraction complete; final state verified'; END IF;
      RETURN;
    END IF;
    LOCK TABLE public.config IN ACCESS EXCLUSIVE MODE;
    IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attname)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.config'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      IS DISTINCT FROM '[ ["computed_at","timestamp with time zone",true,"now()"],["key","text",true,null],["note","text",false,null],["value","text",true,null] ]'::jsonb
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.config'::regclass AND contype<>'n')<>1
      OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.config'::regclass AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (key)') THEN RAISE EXCEPTION '0049 config shape mismatch'; END IF;
    IF (SELECT count(*) FROM public.config)<>3 OR EXISTS(SELECT 1 FROM public.config WHERE key NOT IN ('rain_1h_mm','elev_min','elev_max')) THEN RAISE EXCEPTION '0049 unexpected config key'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_fill_actor_account_type' AND tgtype=7 AND tgenabled='O' AND tgfoid=to_regprocedure('public.admin_audit_events_fill_actor_account_type()') AND tgqual IS NULL AND tgnargs=0)
      OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_audit_events_fill_actor_account_type()') AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace('
BEGIN
  IF NEW.actor_account_type IS NULL THEN
    NEW.actor_account_type := CASE NEW.actor_role
      WHEN ''officer'' THEN ''PERSONNEL''
      WHEN ''supervisor'' THEN ''PERSONNEL''
      WHEN ''focal'' THEN ''PERSONNEL''
      WHEN ''system_admin'' THEN ''SYSTEM_ADMIN''
    END::admin_account_type;
  END IF;
  RETURN NEW;
END
','[[:space:]]','','g') AND l.lanname='plpgsql' AND NOT p.prosecdef AND p.proconfig IS NULL AND p.prorettype='trigger'::regtype AND p.prokind='f' AND p.pronargs=0 AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u') THEN RAISE EXCEPTION '0049 compatibility definition mismatch'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements('[{"name":"legacy_operational_constraints","type":"text[]","required":true},{"name":"legacy_deferment_reason","type":"text","required":false},{"name":"legacy_referral_reason","type":"text","required":false},{"name":"legacy_operational_constraint_notes","type":"jsonb","required":true}]'::jsonb) LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.operational_assessments'::regclass AND a.attname=entry->>'name' AND NOT a.attisdropped
        AND format_type(a.atttypid,a.atttypmod)=entry->>'type' AND a.attnotnull=(entry->>'required')::boolean
        AND pg_get_expr(d.adbin,d.adrelid) IS NOT DISTINCT FROM CASE entry->>'name' WHEN 'legacy_operational_constraints' THEN quote_literal('{}') || '::text[]' WHEN 'legacy_operational_constraint_notes' THEN quote_literal('{}') || '::jsonb' ELSE NULL END) THEN RAISE EXCEPTION '0049 legacy column mismatch'; END IF;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass AND conname='operational_assessments_constraint_notes_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((jsonb_typeof(legacy_operational_constraint_notes) = ''object''::text))') THEN RAISE EXCEPTION '0049 legacy notes CHECK mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM public.operational_assessments WHERE coalesce(array_ndims(legacy_operational_constraints),1)<>1
      OR array_position(legacy_operational_constraints,NULL) IS NOT NULL OR jsonb_typeof(legacy_operational_constraint_notes) IS DISTINCT FROM 'object') THEN
      RAISE EXCEPTION '0049 invalid legacy assessment values'; END IF;
    IF EXISTS(SELECT 1 FROM public.operational_assessments WHERE EXISTS(SELECT 1 FROM jsonb_each(legacy_operational_constraint_notes) n
      WHERE jsonb_typeof(n.value)<>'string' OR NOT (n.key=ANY(legacy_operational_constraints)))) THEN RAISE EXCEPTION '0049 invalid legacy notes'; END IF;
    IF EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_proc'::regclass AND objid='public.admin_audit_events_fill_actor_account_type()'::regprocedure AND deptype='e')
      OR EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_class'::regclass AND objid='public.config'::regclass AND deptype='e') THEN RAISE EXCEPTION '0049 unexpected extension ownership'; END IF;
    -- Catalog dependency allowlist: only expected owned defaults/NOT NULL, config PK,
    -- its index, and the exact legacy notes CHECK. Views/rules/expression indexes/FKs abort.
    FOR target IN
      SELECT 'pg_class'::regclass classid,a.attrelid objid,a.attnum::integer subid,a.attname name FROM pg_attribute a
      WHERE a.attnum>0 AND NOT a.attisdropped AND ((a.attrelid='public.operational_assessments'::regclass AND a.attname=ANY(ARRAY['legacy_deferment_reason','legacy_referral_reason','legacy_operational_constraints','legacy_operational_constraint_notes']))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements('[["reports","elevation_m","real"],["tickets","elevation_m","real"],["tickets","elevation_factor","real"],["tickets","precipitation_factor","real"],["tickets","cluster_factor","real"],["tickets","urgency_score","real"],["tickets","urgency_band","text"],["tickets","priority_score","integer"],["tickets","urgency_level","text"]]'::jsonb) x WHERE a.attrelid=('public.'||(x->>0))::regclass AND a.attname=x->>1))
      UNION ALL SELECT 'pg_class'::regclass,'public.config'::regclass,0,'config'
      UNION ALL SELECT 'pg_proc'::regclass,'public.admin_audit_events_fill_actor_account_type()'::regprocedure,0,'compatibility function'
    LOOP
      FOR dependency IN SELECT d.*,pg_describe_object(d.classid,d.objid,d.objsubid) description FROM pg_depend d
        WHERE d.refclassid=target.classid AND d.refobjid=target.objid AND (target.subid=0 OR d.refobjsubid=target.subid)
      LOOP
        IF dependency.classid='pg_attrdef'::regclass AND (target.subid>0 OR target.name='config') AND EXISTS(SELECT 1 FROM pg_attrdef WHERE oid=dependency.objid AND adrelid=target.objid AND (adnum=target.subid OR target.name='config')) THEN CONTINUE; END IF;
        IF dependency.classid='pg_constraint'::regclass AND EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid=dependency.objid AND c.conrelid=target.objid AND
          ((c.contype='n' AND target.subid>0 AND c.conkey=ARRAY[target.subid]::smallint[]) OR (target.name='config' AND c.contype IN ('n','p')) OR (c.conname='operational_assessments_constraint_notes_check' AND target.name='legacy_operational_constraint_notes'))) THEN CONTINUE; END IF;
        IF target.name='config' AND dependency.classid='pg_class'::regclass AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_constraint c ON c.conindid=i.indexrelid WHERE i.indexrelid=dependency.objid AND i.indrelid=target.objid AND c.contype='p') THEN CONTINUE; END IF;
        IF target.name='config' AND dependency.classid='pg_type'::regclass AND dependency.deptype='i' THEN CONTINUE; END IF;
        IF target.name='config' AND dependency.classid='pg_class'::regclass AND dependency.deptype='i'
          AND EXISTS(SELECT 1 FROM pg_class WHERE oid=target.objid AND reltoastrelid=dependency.objid) THEN CONTINUE; END IF;
        IF target.name='compatibility function' AND dependency.classid='pg_trigger'::regclass AND EXISTS(SELECT 1 FROM pg_trigger WHERE oid=dependency.objid AND tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_fill_actor_account_type') THEN CONTINUE; END IF;
        RAISE EXCEPTION '0049 unexpected dependency on %: %',target.name,dependency.description;
      END LOOP;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class c ON d.refclassid='pg_type'::regclass AND d.refobjid=c.reltype
      WHERE c.oid='public.config'::regclass AND d.classid='pg_proc'::regclass) THEN RAISE EXCEPTION '0049 function depends on config row type'; END IF;
    SELECT jsonb_agg(key ORDER BY key) INTO summary FROM public.config; RAISE NOTICE '0049 config keys: %',summary;
    FOR entry IN SELECT value FROM jsonb_array_elements('[["reports","elevation_m","real"],["tickets","elevation_m","real"],["tickets","elevation_factor","real"],["tickets","precipitation_factor","real"],["tickets","cluster_factor","real"],["tickets","urgency_score","real"],["tickets","urgency_band","text"],["tickets","priority_score","integer"],["tickets","urgency_level","text"]]'::jsonb || '[["operational_assessments","legacy_deferment_reason",""],["operational_assessments","legacy_referral_reason",""],["operational_assessments","legacy_operational_constraints",""],["operational_assessments","legacy_operational_constraint_notes",""]]'::jsonb) LOOP
      EXECUTE format('SELECT jsonb_build_object(''table'',%L,''column'',%L,''non_null'',count(%I)) FROM public.%I',entry->>0,entry->>1,entry->>1,entry->>0) INTO summary;
      RAISE NOTICE '0049 removing: %',summary;
    END LOOP;
    snapshot_before := snapshot_value;
    DROP TRIGGER admin_audit_events_fill_actor_account_type ON public.admin_audit_events;
    DROP FUNCTION public.admin_audit_events_fill_actor_account_type() RESTRICT;
    -- Failure-injection boundary exercised only by the in-memory harness.
    ALTER TABLE public.operational_assessments DROP CONSTRAINT operational_assessments_constraint_notes_check;
    ALTER TABLE public.operational_assessments DROP COLUMN legacy_deferment_reason, DROP COLUMN legacy_referral_reason, DROP COLUMN legacy_operational_constraints, DROP COLUMN legacy_operational_constraint_notes;
    FOR item IN SELECT * FROM (VALUES
      ('assessed_conditions','operational_assessments_observed_conditions_not_null','operational_assessments_assessed_conditions_not_null'),
      ('interim_mitigation','operational_assessments_temporary_mitigation_not_null','operational_assessments_interim_mitigation_not_null'),
      ('created_at','operational_assessments_assessed_at_not_null','operational_assessments_created_at_not_null'),
      ('operational_constraints','operational_assessments_operational_constraints_not_null1','operational_assessments_operational_constraints_not_null')) names(column_name,old_name,new_name)
    LOOP
      IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]::smallint[] WHERE c.conrelid='public.operational_assessments'::regclass AND c.contype='n' AND c.conname=item.old_name AND a.attname=item.column_name AND a.attnotnull) THEN
        EXECUTE format('ALTER TABLE public.operational_assessments RENAME CONSTRAINT %I TO %I',item.old_name,item.new_name);
      END IF;
    END LOOP;
    ALTER TABLE public.reports DROP COLUMN elevation_m;
    ALTER TABLE public.tickets DROP COLUMN elevation_m, DROP COLUMN elevation_factor, DROP COLUMN precipitation_factor, DROP COLUMN cluster_factor, DROP COLUMN urgency_score, DROP COLUMN urgency_band, DROP COLUMN priority_score, DROP COLUMN urgency_level;
    DROP TABLE public.config RESTRICT;
  END LOOP;
END
$contraction$;
