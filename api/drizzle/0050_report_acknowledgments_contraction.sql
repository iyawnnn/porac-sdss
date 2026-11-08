-- 0050: run only through migrate:ack-contraction, in ONE transaction.
-- Lock order: (8048,1), (8049,1), (8050,1), protected tables, then legacy source.
-- Archive is JSONL canonical PostgreSQL JSONB text, id order, UTF-8 and LF,
-- with UTC ISO timestamps retaining all six microsecond digits. No audit writes.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;
DO $ack_contraction$
DECLARE
  pass integer; source_oid oid; item record; dependency record; snapshot_before jsonb; snapshot_now jsonb;
  table_name text; data_hash text; expected_count text; expected_sha text; live_count bigint; live_sha text; counts jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(8048,1); PERFORM pg_advisory_xact_lock(8049,1); PERFORM pg_advisory_xact_lock(8050,1);
  LOCK TABLE public.acknowledgments,public.report_intake_actions,public.notifications,public.tickets,public.reports,public.admin_audit_events IN SHARE MODE;
  FOR pass IN 1..2 LOOP
    -- BEGIN ACKNOWLEDGMENT DEFINITIONS
DECLARE
  item jsonb; actual record; table_name text; table_oid oid; expected_count integer;
BEGIN
  IF to_regclass('public.report_acknowledgments') IS NULL AND to_regclass('public.acknowledgments') IS NULL THEN RAISE EXCEPTION '0050 missing acknowledgment tables'; END IF;
  FOREACH table_name IN ARRAY ARRAY['report_acknowledgments','acknowledgments'] LOOP
    table_oid:=to_regclass('public.'||table_name);
    IF table_oid IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND relpersistence='p' AND NOT relispartition AND NOT relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION '0050 unexpected table kind/RLS: %',table_name; END IF;
    SELECT count(*) INTO expected_count FROM jsonb_array_elements('[{"table":"acknowledgments","name":"acknowledged_at","type":"timestamp with time zone","required":true,"def":"now()"},{"table":"acknowledgments","name":"acknowledged_by_admin_id","type":"integer","required":true,"def":null},{"table":"acknowledgments","name":"id","type":"integer","required":true,"def":"nextval(''acknowledgments_id_seq''::regclass)"},{"table":"acknowledgments","name":"remarks","type":"text","required":false,"def":null},{"table":"acknowledgments","name":"ticket_id","type":"integer","required":true,"def":null},{"table":"report_acknowledgments","name":"acknowledged_at","type":"timestamp with time zone","required":true,"def":"now()"},{"table":"report_acknowledgments","name":"acknowledged_by_admin_id","type":"integer","required":false,"def":null},{"table":"report_acknowledgments","name":"acknowledged_by_name","type":"text","required":false,"def":null},{"table":"report_acknowledgments","name":"id","type":"integer","required":true,"def":"nextval(''report_acknowledgments_id_seq''::regclass)"},{"table":"report_acknowledgments","name":"remarks","type":"text","required":false,"def":null},{"table":"report_acknowledgments","name":"report_id","type":"integer","required":true,"def":null}]'::jsonb) x WHERE x->>'table'=table_name;
    IF (SELECT count(*) FROM pg_attribute WHERE attrelid=table_oid AND attnum>0 AND NOT attisdropped)<>expected_count THEN RAISE EXCEPTION '0050 unexpected acknowledgment columns: %',table_name; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements('[{"table":"acknowledgments","name":"acknowledged_at","type":"timestamp with time zone","required":true,"def":"now()"},{"table":"acknowledgments","name":"acknowledged_by_admin_id","type":"integer","required":true,"def":null},{"table":"acknowledgments","name":"id","type":"integer","required":true,"def":"nextval(''acknowledgments_id_seq''::regclass)"},{"table":"acknowledgments","name":"remarks","type":"text","required":false,"def":null},{"table":"acknowledgments","name":"ticket_id","type":"integer","required":true,"def":null},{"table":"report_acknowledgments","name":"acknowledged_at","type":"timestamp with time zone","required":true,"def":"now()"},{"table":"report_acknowledgments","name":"acknowledged_by_admin_id","type":"integer","required":false,"def":null},{"table":"report_acknowledgments","name":"acknowledged_by_name","type":"text","required":false,"def":null},{"table":"report_acknowledgments","name":"id","type":"integer","required":true,"def":"nextval(''report_acknowledgments_id_seq''::regclass)"},{"table":"report_acknowledgments","name":"remarks","type":"text","required":false,"def":null},{"table":"report_acknowledgments","name":"report_id","type":"integer","required":true,"def":null}]'::jsonb) WHERE value->>'table'=table_name LOOP
      SELECT format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) def INTO actual
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=table_oid AND a.attname=item->>'name' AND a.attnum>0 AND NOT a.attisdropped;
      IF NOT FOUND OR actual.type IS DISTINCT FROM item->>'type' OR actual.required IS DISTINCT FROM (item->>'required')::boolean OR actual.def IS DISTINCT FROM item->>'def' THEN RAISE EXCEPTION '0050 acknowledgment column/type/nullability/default mismatch: %.%',table_name,item->>'name'; END IF;
    END LOOP;
    SELECT count(*) INTO expected_count FROM jsonb_array_elements('[{"table":"acknowledgments","conname":"acknowledgments_acknowledged_by_admin_id_fkey","contype":"f","def":"FOREIGN KEY (acknowledged_by_admin_id) REFERENCES admins(id)"},{"table":"acknowledgments","conname":"acknowledgments_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"table":"acknowledgments","conname":"acknowledgments_ticket_id_fkey","contype":"f","def":"FOREIGN KEY (ticket_id) REFERENCES tickets(id)"},{"table":"acknowledgments","conname":"acknowledgments_ticket_id_key","contype":"u","def":"UNIQUE (ticket_id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_report_id_fkey","contype":"f","def":"FOREIGN KEY (report_id) REFERENCES reports(id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_report_id_key","contype":"u","def":"UNIQUE (report_id)"}]'::jsonb) x WHERE x->>'table'=table_name;
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid=table_oid AND contype<>'n')<>expected_count THEN RAISE EXCEPTION '0050 unexpected acknowledgment constraints: %',table_name; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements('[{"table":"acknowledgments","conname":"acknowledgments_acknowledged_by_admin_id_fkey","contype":"f","def":"FOREIGN KEY (acknowledged_by_admin_id) REFERENCES admins(id)"},{"table":"acknowledgments","conname":"acknowledgments_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"table":"acknowledgments","conname":"acknowledgments_ticket_id_fkey","contype":"f","def":"FOREIGN KEY (ticket_id) REFERENCES tickets(id)"},{"table":"acknowledgments","conname":"acknowledgments_ticket_id_key","contype":"u","def":"UNIQUE (ticket_id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_pkey","contype":"p","def":"PRIMARY KEY (id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_report_id_fkey","contype":"f","def":"FOREIGN KEY (report_id) REFERENCES reports(id)"},{"table":"report_acknowledgments","conname":"report_acknowledgments_report_id_key","contype":"u","def":"UNIQUE (report_id)"}]'::jsonb) WHERE value->>'table'=table_name LOOP
      IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=table_oid AND conname=item->>'conname' AND contype::text=item->>'contype' AND convalidated AND NOT condeferrable AND pg_get_constraintdef(oid)=item->>'def') THEN RAISE EXCEPTION '0050 acknowledgment constraint mismatch: %',item->>'conname'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_constraint c LEFT JOIN pg_index i ON i.indexrelid=c.conindid WHERE c.conrelid=table_oid AND c.contype IN ('p','u') AND (i.indexrelid IS NULL OR NOT i.indisvalid OR NOT i.indisready OR NOT i.indisunique)) THEN RAISE EXCEPTION '0050 invalid acknowledgment uniqueness index'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_depend d JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid WHERE d.classid='pg_class'::regclass AND d.objid=to_regclass('public.'||table_name||'_id_seq') AND d.refclassid='pg_class'::regclass AND d.refobjid=table_oid AND d.deptype='a' AND a.attname='id') THEN RAISE EXCEPTION '0050 missing/incorrect owned sequence: %',table_name; END IF;
  END LOOP;
  IF to_regclass('public.report_acknowledgments') IS NULL AND (to_regclass('public.report_acknowledgments_id_seq') IS NOT NULL OR to_regtype('public.report_acknowledgments') IS NOT NULL OR to_regclass('public.report_acknowledgments_pkey') IS NOT NULL OR to_regclass('public.report_acknowledgments_report_id_key') IS NOT NULL) THEN RAISE EXCEPTION '0050 mixed contracted state'; END IF;
END;
-- END ACKNOWLEDGMENT DEFINITIONS
    IF to_regclass('public.acknowledgments') IS NULL THEN RAISE EXCEPTION '0050 ticket acknowledgments missing'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND tgname='admin_audit_events_append_only' AND tgtype=27 AND tgenabled='O' AND tgfoid=to_regprocedure('public.admin_audit_events_reject_update_delete()') AND tgnargs=0 AND tgqual IS NULL)
      OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.admin_audit_events_reject_update_delete()') AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace('
BEGIN
  RAISE EXCEPTION ''admin_audit_events is append-only: UPDATE and DELETE are not allowed'';
END
','[[:space:]]','','g') AND l.lanname='plpgsql' AND NOT p.prosecdef AND p.proconfig IS NULL AND p.prorettype='trigger'::regtype)
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.admin_audit_events'::regclass AND attname='actor_role' AND atttypid='public.admin_role'::regtype AND attnotnull) THEN RAISE EXCEPTION '0050 audit protection mismatch'; END IF;
    snapshot_now:=jsonb_build_object(
      'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ANY(ARRAY['public.acknowledgments'::regclass,'public.report_intake_actions'::regclass,'public.notifications'::regclass,'public.tickets'::regclass,'public.reports'::regclass,'public.admin_audit_events'::regclass]) AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid,conname,pg_get_constraintdef(oid),convalidated) ORDER BY conrelid,conname) FROM pg_constraint WHERE conrelid=ANY(ARRAY['public.acknowledgments'::regclass,'public.report_intake_actions'::regclass,'public.notifications'::regclass,'public.tickets'::regclass,'public.reports'::regclass,'public.admin_audit_events'::regclass])),
      'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(ARRAY['acknowledgments','report_intake_actions','notifications','tickets','reports','admin_audit_events'])),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgrelid,tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid=ANY(ARRAY['public.acknowledgments'::regclass,'public.report_intake_actions'::regclass,'public.notifications'::regclass,'public.tickets'::regclass,'public.reports'::regclass,'public.admin_audit_events'::regclass])),
      'audit_function',pg_get_functiondef('public.admin_audit_events_reject_update_delete()'::regprocedure),
      'role_enum',(SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.admin_role'::regtype));
    FOREACH table_name IN ARRAY ARRAY['acknowledgments','report_intake_actions','notifications','tickets','reports','admin_audit_events'] LOOP
      EXECUTE format('SELECT md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' ORDER BY id),'''')) FROM public.%I x',table_name) INTO data_hash;
      snapshot_now:=snapshot_now||jsonb_build_object(table_name,data_hash);
    END LOOP;
    IF pass=2 AND snapshot_now IS DISTINCT FROM snapshot_before THEN RAISE EXCEPTION '0050 protected rows/definitions changed'; END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND p.prosrc ~* '\mreport_acknowledgments\M') THEN RAISE EXCEPTION '0050 function source references legacy acknowledgments'; END IF;
    source_oid:=to_regclass('public.report_acknowledgments');
    IF source_oid IS NULL THEN
      IF pass=1 THEN RAISE NOTICE '0050 final state verified; no changes'; ELSE RAISE NOTICE '0050 contraction complete; protected state verified'; END IF;
      RETURN;
    END IF;
    IF pass=2 THEN RAISE EXCEPTION '0050 did not reach contracted state'; END IF;
    LOCK TABLE public.report_acknowledgments IN ACCESS EXCLUSIVE MODE;
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid=source_oid) THEN RAISE EXCEPTION '0050 incoming acknowledgment FK'; END IF;
    IF EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_class'::regclass AND objid=source_oid AND deptype='e') THEN RAISE EXCEPTION '0050 legacy table is extension-owned'; END IF;
    FOR dependency IN SELECT d.*,pg_describe_object(d.classid,d.objid,d.objsubid) description FROM pg_depend d
      WHERE d.refclassid='pg_class'::regclass AND d.refobjid=source_oid LOOP
      IF dependency.classid='pg_constraint'::regclass AND EXISTS(SELECT 1 FROM pg_constraint WHERE oid=dependency.objid AND conrelid=source_oid AND (contype='n' OR conname IN ('report_acknowledgments_pkey','report_acknowledgments_report_id_key','report_acknowledgments_report_id_fkey'))) THEN CONTINUE; END IF;
      IF dependency.classid='pg_attrdef'::regclass AND EXISTS(SELECT 1 FROM pg_attrdef WHERE oid=dependency.objid AND adrelid=source_oid) THEN CONTINUE; END IF;
      IF dependency.classid='pg_class'::regclass AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_constraint c ON c.conindid=i.indexrelid WHERE i.indexrelid=dependency.objid AND i.indrelid=source_oid AND c.contype IN ('p','u')) THEN CONTINUE; END IF;
      IF dependency.classid='pg_class'::regclass AND dependency.objid=to_regclass('public.report_acknowledgments_id_seq') AND dependency.deptype='a' THEN CONTINUE; END IF;
      IF dependency.classid='pg_class'::regclass AND dependency.deptype='i' AND EXISTS(SELECT 1 FROM pg_class WHERE oid=source_oid AND reltoastrelid=dependency.objid) THEN CONTINUE; END IF;
      IF dependency.classid='pg_type'::regclass AND dependency.deptype='i' THEN CONTINUE; END IF;
      RAISE EXCEPTION '0050 unexpected legacy dependency: %',dependency.description;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class c ON c.oid=source_oid JOIN pg_type t ON t.oid=c.reltype WHERE d.refclassid='pg_type'::regclass AND d.refobjid IN (c.reltype,t.typarray) AND NOT (d.classid='pg_type'::regclass AND d.objid=t.typarray AND d.deptype='i')) THEN RAISE EXCEPTION '0050 dependency on legacy row type'; END IF;
    IF EXISTS(SELECT 1 FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid='public.report_acknowledgments_id_seq'::regclass AND NOT (d.classid='pg_attrdef'::regclass AND EXISTS(SELECT 1 FROM pg_attrdef a JOIN pg_attribute c ON c.attrelid=a.adrelid AND c.attnum=a.adnum WHERE a.oid=d.objid AND a.adrelid=source_oid AND c.attname='id'))) THEN RAISE EXCEPTION '0050 unexpected dependency on legacy sequence'; END IF;
    IF EXISTS(SELECT 1 FROM public.report_acknowledgments WHERE NOT isfinite(acknowledged_at)) THEN RAISE EXCEPTION '0050 non-finite archive timestamp'; END IF;
    SELECT jsonb_build_object('total_rows',count(*),'distinct_tickets',count(DISTINCT r.ticket_id),'later_events',count(*)-count(DISTINCT r.ticket_id),'rows_with_remarks',count(*) FILTER(WHERE ra.remarks IS NOT NULL),'acknowledged_reports_without_ticket_ack',count(*) FILTER(WHERE a.id IS NULL)) INTO counts
      FROM public.report_acknowledgments ra JOIN public.reports r ON r.id=ra.report_id LEFT JOIN public.acknowledgments a ON a.ticket_id=r.ticket_id;
    RAISE NOTICE '0050 source counts: %',counts;
    IF (counts->>'acknowledged_reports_without_ticket_ack')::bigint>0 THEN RAISE EXCEPTION '0050 acknowledged reports have no ticket acknowledgment; nothing changed'; END IF;
    SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(canonical_row||E'\n','' ORDER BY id),''),'UTF8')),'hex') INTO live_count,live_sha FROM (
      -- BEGIN CANONICAL ROW QUERY
      SELECT id, jsonb_build_object(
        'id',id,'report_id',report_id,'acknowledged_by_admin_id',acknowledged_by_admin_id,
        'acknowledged_by_name',acknowledged_by_name,'remarks',remarks,
        'acknowledged_at',to_char(acknowledged_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )::text AS canonical_row FROM public.report_acknowledgments
      -- END CANONICAL ROW QUERY
    ) canonical;
    -- BEGIN ARCHIVE GUARD
    expected_count:=current_setting('porac.ack_archive_count',true);expected_sha:=current_setting('porac.ack_archive_sha256',true);
    IF expected_count IS NULL OR expected_count !~ '^[0-9]+$' OR expected_sha IS NULL OR expected_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION '0050 verified archive is required'; END IF;
    IF expected_count::numeric<>live_count OR expected_sha<>live_sha THEN RAISE EXCEPTION '0050 archive count/checksum mismatch; nothing changed'; END IF;
    -- END ARCHIVE GUARD
    snapshot_before:=snapshot_now;
    ALTER TABLE public.report_acknowledgments DROP CONSTRAINT report_acknowledgments_report_id_fkey;
    -- Failure-injection boundary: checked only by the in-memory harness.
    DROP TABLE public.report_acknowledgments RESTRICT;
  END LOOP;
END
$ack_contraction$;
