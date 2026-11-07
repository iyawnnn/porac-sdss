-- Read-only catalog/row summary; safe before and after 0048, including mixed states.
SELECT
 (SELECT count(*)::int FROM public.operational_assessments WHERE assessed_by_admin_id IS NULL) AS null_assessors,
 (SELECT count(*)::int FROM public.operational_assessments a WHERE assessed_by_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.admins d WHERE d.id::text=a.assessed_by_admin_id::text)) AS orphan_assessors,
 (SELECT count(*)::int FROM (SELECT ticket_id FROM public.operational_assessments GROUP BY ticket_id HAVING count(*)>1) duplicates) AS duplicate_tickets,
 (SELECT count(*)::int FROM public.operational_assessments) AS assessments_total,
 (SELECT jsonb_object_agg(a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)))
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.operational_assessments'::regclass AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_object_agg(conname,jsonb_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated))
 FROM pg_constraint WHERE conrelid='public.operational_assessments'::regclass) AS constraints;
