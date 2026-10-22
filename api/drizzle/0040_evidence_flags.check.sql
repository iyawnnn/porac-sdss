-- Read-only before/after check for 0040_evidence_flags.sql. Two queries,
-- separated by the same statement-breakpoint comment as the migrations; both
-- are safe to run at any time (0040 adds no columns).
--   1. The flags as they are now: reports per flag code (the part before
--      any ':'), and three counts that must be 0 after the migration —
--      leftover_retired_codes (STALE_PHOTO / NO_EXIF), stale_evidence_off_list
--      (STALE_EVIDENCE on a category outside the stale list) and
--      saved_views_old_codes (a saved view still filtering flag=STALE_PHOTO or
--      flag=NO_EXIF).
--   2. What 0040 would still change, computed with the migration's own rule:
--      reports to update, reports gaining and losing each code, and the queue
--      effect — newly_flagged_pending (no flags before, flags after, not yet
--      moderated: they appear in the Flagged Reports queue),
--      emptied_pending (flags before, none after, not yet moderated: they
--      leave the queue) and emptied_moderated (they leave the queue's
--      Dismissed/Quarantined/Duplicate tabs; the decision itself is kept).
--      Before the migration it is the plan; after it, every count is 0.
-- Keep the category list identical to 0040_evidence_flags.sql.
WITH per_code AS (
  SELECT split_part(f, ':', 1) AS code, count(DISTINCT r.id)::int AS reports
  FROM reports r, unnest(r.flags) AS f
  GROUP BY 1
)
SELECT
  (SELECT count(*) FROM reports)::int AS reports_total,
  (SELECT count(*) FROM reports WHERE cardinality(flags) > 0)::int AS reports_flagged,
  (
    SELECT count(*) FROM reports WHERE cardinality(flags) > 0 AND moderation_status IS NULL
  )::int AS reports_flagged_pending,
  (SELECT json_object_agg(code, reports ORDER BY code) FROM per_code) AS reports_per_code,
  (
    SELECT count(*) FROM reports WHERE flags && ARRAY['STALE_PHOTO', 'NO_EXIF']
  )::int AS leftover_retired_codes,
  (
    SELECT count(*) FROM reports
    WHERE 'STALE_EVIDENCE' = ANY (flags)
      AND submitted_category NOT IN (
    'Localized Flooding',
    'Rain-Induced Slope Failure/Landslide',
    'Lahar or Volcanic Debris-Flow Threat',
    'Fallen Tree or Storm-Related Road Obstruction',
    'Flooding',
    'Landslide / Slope Failure',
    'Lahar / Debris-Flow Threat',
    'Fallen Tree / Storm-Related Obstruction',
    'Fallen Tree'
      )
  )::int AS stale_evidence_off_list,
  (
    SELECT count(*) FROM admin_saved_views
    WHERE query ~ '(^|[?&])flag=(STALE_PHOTO|NO_EXIF)(&|$)'
  )::int AS saved_views_old_codes;
--> statement-breakpoint
WITH recomputed AS (
  SELECT
    id,
    moderation_status,
    flags AS old_flags,
    CASE
      WHEN cardinality(computed) = 0 AND flags IS NULL THEN NULL
      ELSE computed
    END AS new_flags
  FROM (
    SELECT
      id,
      moderation_status,
      flags,
      ARRAY(
        SELECT kept.f
        FROM unnest(flags) WITH ORDINALITY AS kept(f, position)
        WHERE kept.f NOT IN (
          'LOCATION_MISMATCH', 'STALE_PHOTO', 'STALE_EVIDENCE', 'NO_EXIF', 'MISSING_METADATA'
        )
        ORDER BY kept.position
      )
      || CASE
           WHEN location_mismatch_m > 50 THEN ARRAY['LOCATION_MISMATCH']
           ELSE ARRAY[]::text[]
         END
      || CASE
           WHEN COALESCE(flags && ARRAY['STALE_PHOTO', 'STALE_EVIDENCE'], false)
             AND submitted_category IN (
    'Localized Flooding',
    'Rain-Induced Slope Failure/Landslide',
    'Lahar or Volcanic Debris-Flow Threat',
    'Fallen Tree or Storm-Related Road Obstruction',
    'Flooding',
    'Landslide / Slope Failure',
    'Lahar / Debris-Flow Threat',
    'Fallen Tree / Storm-Related Obstruction',
    'Fallen Tree'
             )
           THEN ARRAY['STALE_EVIDENCE']
           ELSE ARRAY[]::text[]
         END
      || CASE
           WHEN exif_captured_at IS NULL THEN ARRAY['MISSING_METADATA']
           ELSE ARRAY[]::text[]
         END AS computed
    FROM reports
  ) c
),
changes AS (
  SELECT * FROM recomputed WHERE old_flags IS DISTINCT FROM new_flags
),
codes(code) AS (
  VALUES ('LOCATION_MISMATCH'), ('STALE_PHOTO'), ('STALE_EVIDENCE'), ('NO_EXIF'), ('MISSING_METADATA')
)
SELECT
  (SELECT count(*) FROM changes)::int AS reports_to_update,
  (
    SELECT json_object_agg(code, n ORDER BY code) FROM (
      SELECT codes.code, count(changes.id)::int AS n
      FROM codes
      LEFT JOIN changes
        ON codes.code = ANY (changes.new_flags)
        AND NOT COALESCE(codes.code = ANY (changes.old_flags), false)
      GROUP BY codes.code
    ) g
  ) AS reports_gaining,
  (
    SELECT json_object_agg(code, n ORDER BY code) FROM (
      SELECT codes.code, count(changes.id)::int AS n
      FROM codes
      LEFT JOIN changes
        ON codes.code = ANY (changes.old_flags)
        AND NOT COALESCE(codes.code = ANY (changes.new_flags), false)
      GROUP BY codes.code
    ) g
  ) AS reports_losing,
  (
    SELECT count(*) FROM changes
    WHERE COALESCE(cardinality(old_flags), 0) = 0
      AND cardinality(new_flags) > 0
      AND moderation_status IS NULL
  )::int AS newly_flagged_pending,
  (
    SELECT count(*) FROM changes
    WHERE cardinality(old_flags) > 0
      AND COALESCE(cardinality(new_flags), 0) = 0
      AND moderation_status IS NULL
  )::int AS emptied_pending,
  (
    SELECT count(*) FROM changes
    WHERE cardinality(old_flags) > 0
      AND COALESCE(cardinality(new_flags), 0) = 0
      AND moderation_status IS NOT NULL
  )::int AS emptied_moderated;
