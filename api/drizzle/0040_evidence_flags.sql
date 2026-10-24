-- Manuscript revision Phase 3, step 3b: evidence-integrity flags per the
-- manuscript (pp. 42–43, Appendix H REPORTS.flags). New reports get them from
-- ReportsService.submit (evidenceCheckFlags); this brings existing reports'
-- flags in line.
--
-- Every element this migration does not manage is kept, in its original
-- order: DUPLICATE_IMAGE:<id>, BOUNDARY_FALLBACK:<name>:<m> and
-- TIMESTAMP_ANOMALY. The managed codes are recomputed:
--   removed: LOCATION_MISMATCH, STALE_PHOTO, STALE_EVIDENCE, NO_EXIF,
--            MISSING_METADATA
--   then appended, in this order:
--   1. LOCATION_MISMATCH when location_mismatch_m > 50 (the stored distance;
--      distances are not recomputed). The old threshold was 100 m.
--   2. STALE_EVIDENCE when the old flags had STALE_PHOTO or STALE_EVIDENCE and
--      submitted_category is one of the time-sensitive categories below
--      (legacy names included). Other categories are never stale.
--   3. MISSING_METADATA when exif_captured_at IS NULL (no usable capture
--      time).
-- NO_EXIF (a photo without GPS) has no replacement: no usable GPS now means
-- no location flag at all.
-- TIMESTAMP_ANOMALY is deliberately NOT added to old reports: their stored
-- capture times may be shifted by hours by the old server-time-zone bug
-- (exifr read the EXIF wall-clock time in the server's zone, fixed in the
-- same step), so a "future" capture time there is not evidence of anything.
--
-- An array that ends up empty is stored as '{}', as ReportsService.submit
-- stores "no flags"; a NULL that stays empty stays NULL. Moderation decisions
-- (moderation_status, moderation_note, moderated_at, moderated_by) are never
-- touched. Only rows whose flags actually change are updated, so a second run
-- updates 0 rows.
--
-- Keep the category list identical to STALE_EVIDENCE_CATEGORIES in
-- api/src/reports/reports.service.ts (a unit test compares them).
--
-- Saved views (admin_saved_views.query, a serialized querystring) are
-- rewritten by the migrate script in the same transaction, parsed with
-- URLSearchParams as in 0035: flag=STALE_PHOTO becomes flag=STALE_EVIDENCE,
-- and a flag=NO_EXIF filter is dropped (it has no equivalent).
--   pnpm --prefix api migrate:evidence-flags
-- (applying this file by hand, wrap it in BEGIN/COMMIT yourself; saved views
-- are then left on the old codes, which the flag filter now ignores.)
--
-- Before/after check (the same queries the migrate script prints):
--   api/drizzle/0040_evidence_flags.check.sql
UPDATE reports r
SET flags = n.new_flags
FROM (
  SELECT
    id,
    CASE
      WHEN cardinality(recomputed) = 0 AND flags IS NULL THEN NULL
      ELSE recomputed
    END AS new_flags
  FROM (
    SELECT
      id,
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
         END AS recomputed
    FROM reports
  ) computed
) n
WHERE r.id = n.id
  AND r.flags IS DISTINCT FROM n.new_flags;
