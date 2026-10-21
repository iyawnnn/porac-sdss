-- Ticket counts per category name touched by 0035_categories_manuscript.sql.
-- Run it before and after (pnpm --prefix api migrate:categories-manuscript
-- prints it both times). After: the three renamed old names are 0 and their
-- counts have moved to the new names; old_drainage_combined is unchanged and
-- equals review_required_on_old_drainage. review_required is read through
-- to_jsonb(t) so this also runs BEFORE the column exists (it reads 0 then).
SELECT
  COUNT(*) FILTER (WHERE category = 'Drainage / Culvert / Manhole Issue')::int AS old_drainage_combined,
  COUNT(*) FILTER (WHERE category = 'Landslide / Slope Failure')::int AS old_landslide,
  COUNT(*) FILTER (WHERE category = 'Lahar / Debris-Flow Threat')::int AS old_lahar,
  COUNT(*) FILTER (WHERE category = 'Fallen Tree / Storm-Related Obstruction')::int AS old_fallen_tree,
  COUNT(*) FILTER (
    WHERE (to_jsonb(t) ->> 'category_review_required')::boolean
  )::int AS review_required,
  COUNT(*) FILTER (
    WHERE category = 'Drainage / Culvert / Manhole Issue'
      AND (to_jsonb(t) ->> 'category_review_required')::boolean
  )::int AS review_required_on_old_drainage,
  COUNT(*) FILTER (WHERE category = 'Damaged Manhole Cover')::int AS new_manhole_cover,
  COUNT(*) FILTER (WHERE category = 'Clogged Drainage / Damaged Culvert')::int AS new_clogged_drainage,
  COUNT(*) FILTER (WHERE category = 'Rain-Induced Slope Failure/Landslide')::int AS new_landslide,
  COUNT(*) FILTER (WHERE category = 'Lahar or Volcanic Debris-Flow Threat')::int AS new_lahar,
  COUNT(*) FILTER (WHERE category = 'Fallen Tree or Storm-Related Road Obstruction')::int AS new_fallen_tree
FROM tickets t;
