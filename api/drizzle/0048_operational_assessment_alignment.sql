-- 0048: run in ONE transaction, through migrate:assessment-alignment.
-- No audit writes. Original creator/timestamps and four legacy columns survive.
-- Stop assessment consumers for the schema/app cutover. Legacy columns retire in 8b.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
DO $alignment$
DECLARE
  old_spec jsonb := '[{"name":"id","type":"integer","required":true},{"name":"ticket_id","type":"integer","required":true},{"name":"assessed_by_admin_id","type":"integer","required":false},{"name":"assessed_by_name","type":"text","required":false},{"name":"observed_conditions","type":"text","required":true},{"name":"safety_implications","type":"text","required":true},{"name":"operational_constraints","type":"text[]","required":true},{"name":"recommended_action","type":"text","required":true},{"name":"temporary_mitigation","type":"text","required":true},{"name":"deferment_reason","type":"text","required":false},{"name":"referral_reason","type":"text","required":false},{"name":"remarks","type":"text","required":false},{"name":"assessed_at","type":"timestamp with time zone","required":true},{"name":"updated_by_admin_id","type":"integer","required":false},{"name":"updated_by_name","type":"text","required":false},{"name":"updated_at","type":"timestamp with time zone","required":true},{"name":"actual_action","type":"text","required":false},{"name":"supporting_evidence_url","type":"text","required":false},{"name":"operational_constraint_notes","type":"jsonb","required":true}]'::jsonb;
  final_spec jsonb := '[{"name":"id","type":"integer","required":true},{"name":"ticket_id","type":"integer","required":true},{"name":"assessed_by_admin_id","type":"integer","required":true},{"name":"assessed_by_name","type":"text","required":false},{"name":"assessed_conditions","type":"text","required":true},{"name":"safety_implications","type":"text","required":true},{"name":"legacy_operational_constraints","type":"text[]","required":true},{"name":"recommended_action","type":"text","required":true},{"name":"interim_mitigation","type":"text","required":true},{"name":"legacy_deferment_reason","type":"text","required":false},{"name":"legacy_referral_reason","type":"text","required":false},{"name":"remarks","type":"text","required":false},{"name":"created_at","type":"timestamp with time zone","required":true},{"name":"updated_by_admin_id","type":"integer","required":false},{"name":"updated_by_name","type":"text","required":false},{"name":"updated_at","type":"timestamp with time zone","required":true},{"name":"actual_action","type":"text","required":false},{"name":"supporting_evidence_url","type":"text","required":false},{"name":"legacy_operational_constraint_notes","type":"jsonb","required":true},{"name":"deferment_or_referral_reason","type":"text","required":false},{"name":"operational_constraints","type":"jsonb","required":true}]'::jsonb;
  actual jsonb;
  state text;
  pass integer;
  issue record;
  bad_count bigint;
  bad_ids jsonb;
  array_expr text;
  notes_expr text;
  mismatch jsonb;
BEGIN
  FOR pass IN 1..3 LOOP
    SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull) ORDER BY a.attname)
      INTO actual FROM pg_attribute a
      WHERE a.attrelid = 'public.operational_assessments'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
    IF actual @> old_spec AND old_spec @> actual THEN
      state := 'old';
    ELSIF actual @> final_spec AND final_spec @> actual THEN
      state := 'final';
    ELSE
      SELECT jsonb_agg(x) INTO mismatch FROM (
        SELECT value AS x FROM jsonb_array_elements(actual)
        WHERE NOT (old_spec @> jsonb_build_array(value)) AND NOT (final_spec @> jsonb_build_array(value))
      ) s;
      RAISE EXCEPTION '0048 preflight: unexpected or mixed assessment columns/types/nullability; actual=%, unexpected=%', actual, mismatch;
    END IF;
    IF pass=3 AND state<>'final' THEN RAISE EXCEPTION '0048 did not reach the final state'; END IF;
    -- Existing integrity rules are part of both accepted states, not just names.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.operational_assessments'::regclass AND c.contype='u'
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='ticket_id')]::smallint[])
      OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.operational_assessments'::regclass AND c.contype='p'
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='id')]::smallint[])
      OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.operational_assessments'::regclass AND c.contype='f'
      AND c.confrelid='public.tickets'::regclass AND c.convalidated
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='ticket_id')]::smallint[]
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass
      AND conname='operational_assessments_evidence_url_check' AND contype='c' AND convalidated)
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass
      AND conname='operational_assessments_constraint_notes_check' AND contype='c' AND convalidated) THEN
      -- Duplicate ids are still reported before refusing a missing uniqueness rule.
      SELECT count(*), to_jsonb((array_agg(id ORDER BY id))[1:50]) INTO bad_count,bad_ids FROM public.operational_assessments
        WHERE ticket_id IN (SELECT ticket_id FROM public.operational_assessments GROUP BY ticket_id HAVING count(*)>1);
      IF bad_count > 0 THEN RAISE EXCEPTION '0048 preflight: duplicate ticket ids (% rows); ids=%',bad_count,bad_ids; END IF;
      RAISE EXCEPTION '0048 preflight: missing original PK, UNIQUE(ticket_id), ticket FK or assessment CHECK';
    END IF;
    IF state='final' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.operational_assessments'::regclass AND c.contype='f'
        AND c.conname='operational_assessments_assessed_by_admin_id_fkey' AND c.confrelid='public.admins'::regclass
        AND c.confdeltype='r' AND c.convalidated
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='assessed_by_admin_id')]::smallint[]
        AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
        OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass
        AND conname='operational_assessments_constraints_shape_check' AND contype='c' AND convalidated) THEN
        RAISE EXCEPTION '0048 preflight: mixed final state, missing validated assessor RESTRICT FK or JSON CHECK';
      END IF;
      array_expr := 'legacy_operational_constraints'; notes_expr := 'legacy_operational_constraint_notes';
    ELSE
      array_expr := 'operational_constraints'; notes_expr := 'operational_constraint_notes';
    END IF;
    FOR issue IN SELECT * FROM (VALUES
      ('NULL assessor','assessed_by_admin_id IS NULL'),
      ('orphan assessor','NOT EXISTS (SELECT 1 FROM public.admins d WHERE d.id=a.assessed_by_admin_id)'),
      ('duplicate ticket ids','ticket_id IN (SELECT ticket_id FROM public.operational_assessments GROUP BY ticket_id HAVING count(*)>1)'),
      ('multidimensional constraints',format('coalesce(array_ndims(%s),1) <> 1',array_expr)),
      ('NULL constraint elements',format('array_position(%s,NULL) IS NOT NULL',array_expr)),
      ('non-object constraint notes',format('jsonb_typeof(%s) IS DISTINCT FROM ''object''',notes_expr)),
      ('non-string constraint notes',format('EXISTS (SELECT 1 FROM jsonb_each(%s) n WHERE jsonb_typeof(n.value) <> ''string'')',notes_expr)),
      ('unselected constraint note key',format('EXISTS (SELECT 1 FROM jsonb_object_keys(%s) n(key) WHERE NOT (n.key=ANY(%s)))',notes_expr,array_expr))
    ) checks(label,predicate) LOOP
      EXECUTE format('SELECT count(*), (SELECT jsonb_agg(id) FROM (SELECT id FROM public.operational_assessments a WHERE %s ORDER BY id LIMIT 50) bounded) FROM public.operational_assessments a WHERE %s',issue.predicate,issue.predicate)
        INTO bad_count,bad_ids;
      IF bad_count > 0 THEN RAISE EXCEPTION '0048 preflight: % (% rows); ids=%',issue.label,bad_count,bad_ids; END IF;
    END LOOP;
    IF state='final' THEN
      FOR issue IN SELECT * FROM (VALUES
        ('invalid constraints JSON shape', $predicate$NOT (jsonb_typeof(operational_constraints)='object' AND operational_constraints ?& ARRAY['selected','notes'] AND jsonb_typeof(operational_constraints->'selected')='array' AND jsonb_typeof(operational_constraints->'notes')='object')$predicate$),
        ('non-string selected constraint', $predicate$EXISTS (SELECT 1 FROM jsonb_array_elements(operational_constraints->'selected') x WHERE jsonb_typeof(x)<>'string')$predicate$),
        ('non-string current note', $predicate$EXISTS (SELECT 1 FROM jsonb_each(operational_constraints->'notes') n WHERE jsonb_typeof(n.value)<>'string')$predicate$),
        ('unselected current note key', $predicate$EXISTS (SELECT 1 FROM jsonb_object_keys(operational_constraints->'notes') n(key) WHERE NOT ((operational_constraints->'selected') ? n.key))$predicate$)
      ) checks(label,predicate) LOOP
        EXECUTE format('SELECT count(*), (SELECT jsonb_agg(id) FROM (SELECT id FROM public.operational_assessments a WHERE %s ORDER BY id LIMIT 50) bounded) FROM public.operational_assessments a WHERE %s',issue.predicate,issue.predicate) INTO bad_count,bad_ids;
        IF bad_count>0 THEN RAISE EXCEPTION '0048 preflight: % (% rows); ids=%',issue.label,bad_count,bad_ids; END IF;
      END LOOP;
    END IF;
    -- Defaults are part of the accepted state as well as types/nullability.
    FOR issue IN SELECT * FROM (VALUES
      ('safety_implications',quote_literal('') || '::text'),
      ('recommended_action',quote_literal('') || '::text'),
      (CASE WHEN state='old' THEN 'observed_conditions' ELSE 'assessed_conditions' END,quote_literal('') || '::text'),
      (CASE WHEN state='old' THEN 'temporary_mitigation' ELSE 'interim_mitigation' END,quote_literal('') || '::text'),
      (CASE WHEN state='old' THEN 'assessed_at' ELSE 'created_at' END,'now()'),
      ('updated_at','now()'),
      (CASE WHEN state='old' THEN 'operational_constraints' ELSE 'legacy_operational_constraints' END,quote_literal('{}') || '::text[]'),
      (CASE WHEN state='old' THEN 'operational_constraint_notes' ELSE 'legacy_operational_constraint_notes' END,quote_literal('{}') || '::jsonb')
    ) defaults(column_name,expression) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='public.operational_assessments'::regclass AND a.attname=issue.column_name
        AND pg_get_expr(d.adbin,d.adrelid)=issue.expression) THEN
        RAISE EXCEPTION '0048 preflight: unexpected default on %',issue.column_name;
      END IF;
    END LOOP;
    IF state='final' AND NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.operational_assessments'::regclass AND a.attname='operational_constraints'
      AND pg_get_expr(d.adbin,d.adrelid)=quote_literal('{"selected":[],"notes":{}}'::jsonb::text) || '::jsonb') THEN
      RAISE EXCEPTION '0048 preflight: unexpected JSON default';
    END IF;
    IF pass=1 THEN
      PERFORM pg_advisory_xact_lock(8048,1);
      LOCK TABLE public.admins IN SHARE MODE;
      LOCK TABLE public.operational_assessments IN ACCESS EXCLUSIVE MODE;
    ELSIF pass=2 THEN
      IF state='final' THEN RAISE NOTICE '0048 final state verified; no changes'; RETURN; END IF;
      ALTER TABLE public.operational_assessments RENAME COLUMN observed_conditions TO assessed_conditions;
      ALTER TABLE public.operational_assessments RENAME COLUMN temporary_mitigation TO interim_mitigation;
      ALTER TABLE public.operational_assessments RENAME COLUMN assessed_at TO created_at;
      ALTER TABLE public.operational_assessments RENAME COLUMN deferment_reason TO legacy_deferment_reason;
      ALTER TABLE public.operational_assessments RENAME COLUMN referral_reason TO legacy_referral_reason;
      ALTER TABLE public.operational_assessments RENAME COLUMN operational_constraints TO legacy_operational_constraints;
      ALTER TABLE public.operational_assessments RENAME COLUMN operational_constraint_notes TO legacy_operational_constraint_notes;
      ALTER TABLE public.operational_assessments ADD COLUMN deferment_or_referral_reason text;
      UPDATE public.operational_assessments SET deferment_or_referral_reason = CASE
        WHEN legacy_deferment_reason IS NOT NULL AND legacy_referral_reason IS NOT NULL
          THEN 'Deferment: ' || legacy_deferment_reason || E'\nReferral: ' || legacy_referral_reason
        ELSE coalesce(legacy_deferment_reason,legacy_referral_reason) END;
      ALTER TABLE public.operational_assessments ADD COLUMN operational_constraints jsonb;
      UPDATE public.operational_assessments SET operational_constraints = jsonb_build_object(
        'selected',to_jsonb(legacy_operational_constraints),'notes',legacy_operational_constraint_notes);
      ALTER TABLE public.operational_assessments
        ALTER COLUMN operational_constraints SET DEFAULT '{"selected":[],"notes":{}}'::jsonb,
        ALTER COLUMN operational_constraints SET NOT NULL,
        ALTER COLUMN assessed_by_admin_id SET NOT NULL,
        ADD CONSTRAINT operational_assessments_constraints_shape_check CHECK (
          jsonb_typeof(operational_constraints)='object' AND operational_constraints ?& ARRAY['selected','notes']
          AND jsonb_typeof(operational_constraints->'selected')='array' AND jsonb_typeof(operational_constraints->'notes')='object'),
        ADD CONSTRAINT operational_assessments_assessed_by_admin_id_fkey FOREIGN KEY (assessed_by_admin_id) REFERENCES public.admins(id) ON DELETE RESTRICT;
    END IF;
  END LOOP;
END
$alignment$;
