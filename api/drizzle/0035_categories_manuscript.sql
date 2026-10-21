-- Manuscript revision Phase 2, step 2a: manuscript category names and the
-- drainage/manhole split (handoff Decisions 6, 9 and 13).
--
-- 1. tickets.category_review_required (implementation extension, Decision
--    13). The combined "Drainage / Culvert / Manhole Issue" category was split
--    into "Damaged Manhole Cover" and "Clogged Drainage / Damaged Culvert"
--    (Decision 6). Which half an old ticket belongs to can't be decided from
--    the data, so those tickets KEEP the old category and are marked for
--    review; staff correct them in Phase 3, which also clears the flag.
-- 2. Three categories are renamed to the manuscript wording (Decision 9):
--      'Landslide / Slope Failure'               -> 'Rain-Induced Slope Failure/Landslide'
--      'Lahar / Debris-Flow Threat'              -> 'Lahar or Volcanic Debris-Flow Threat'
--      'Fallen Tree / Storm-Related Obstruction' -> 'Fallen Tree or Storm-Related Road Obstruction'
--    Routing and grouping radius are unchanged by the rename
--    (api/src/common/utils/office.ts, radius.ts). The old names stay valid
--    legacy values (LEGACY_CATEGORIES in api/src/contracts/schemas.ts).
--
-- Only tickets carry a category column (reports inherit it). History is NOT
-- rewritten: admin_audit_events, notifications and status_history keep
-- whatever category text they recorded.
--
-- Saved views (admin_saved_views.query, a serialized querystring) are
-- rewritten by the migrate script, not here: the category value can be
-- encoded as %20 or + and %2F, which is parsed with URLSearchParams in
-- TypeScript rather than matched with regex SQL. The script runs this file
-- and that rewrite in ONE transaction:
--   pnpm --prefix api migrate:categories-manuscript
-- (applying this file by hand, wrap it in BEGIN/COMMIT yourself; saved views
-- are then left on the old names, which still replay as legacy filters).
--
-- Safe to run more than once: every UPDATE only matches rows still in the old
-- state, so a second run changes 0 rows.
--
-- Before/after check (same query the migrate script prints):
--   api/drizzle/0035_categories_manuscript.check.sql
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS category_review_required boolean NOT NULL DEFAULT false;

UPDATE tickets
SET category = 'Rain-Induced Slope Failure/Landslide'
WHERE category = 'Landslide / Slope Failure';

UPDATE tickets
SET category = 'Lahar or Volcanic Debris-Flow Threat'
WHERE category = 'Lahar / Debris-Flow Threat';

UPDATE tickets
SET category = 'Fallen Tree or Storm-Related Road Obstruction'
WHERE category = 'Fallen Tree / Storm-Related Obstruction';

UPDATE tickets
SET category_review_required = true
WHERE category = 'Drainage / Culvert / Manhole Issue'
  AND category_review_required = false;
