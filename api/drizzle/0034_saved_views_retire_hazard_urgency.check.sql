-- Counts the Ticket Queue saved views that still carry a retired Hazard
-- Urgency key. Run it before and after 0034_saved_views_retire_hazard_urgency.sql:
-- before, views_to_change is how many rows the migration will rewrite; after,
-- every column must be 0. (pnpm --prefix api migrate:saved-views-retire-hazard-urgency
-- prints this same result before and after applying the migration.)
SELECT
  COUNT(*) FILTER (
    WHERE query ~ '(^|&)sort=priority_(desc|asc)(&|$)'
  )::int AS hazard_urgency_sort,
  COUNT(*) FILTER (
    WHERE query ~ '(^|&)urgency='
  )::int AS urgency_filter,
  COUNT(*) FILTER (
    WHERE query ~ '(^|&)sort=priority_(desc|asc)(&|$)'
       OR query ~ '(^|&)urgency='
  )::int AS views_to_change
FROM admin_saved_views
WHERE surface = 'tickets';
