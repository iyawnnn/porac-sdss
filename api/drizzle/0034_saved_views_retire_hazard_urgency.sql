-- Manuscript revision Phase 1, step 4: retire the Hazard Urgency sort and
-- filter from stored Ticket Queue saved views.
--
-- admin_saved_views.query stores a raw queue querystring (see
-- 0028_admin_saved_views.sql). The queue no longer accepts the Hazard
-- Urgency sorts or the urgency filter (api/src/admin/tickets.service.ts
-- parseTicketQuery), so a stored preset carrying them would silently replay
-- as something else. This rewrites them in place:
--
--   sort=priority_desc  ->  sort=op_priority_desc   (Operational Priority)
--   sort=priority_asc   ->  sort=op_priority_asc
--   urgency=<anything>  ->  removed (there is no counterpart filter)
--
-- Only the Ticket Queue surface is touched ('flagged' presets never carried
-- these keys). Names are NOT changed: they are each admin's own labels, so a
-- preset called e.g. "High urgency" keeps its name but now shows every ticket
-- its remaining filters match. These are personal UI presets, not audit
-- history, which is why they are updated in place.
--
-- Safe to run more than once: the WHERE clause only matches rows that still
-- carry a retired key, so a second run updates 0 rows.
--
-- Before/after check (same query the migrate script prints):
--   api/drizzle/0034_saved_views_retire_hazard_urgency.check.sql
UPDATE admin_saved_views
SET query = regexp_replace(
  regexp_replace(
    regexp_replace(
      query,
      '(^|&)sort=priority_(desc|asc)(&|$)',
      '\1sort=op_priority_\2\3'
    ),
    '(^|&)urgency=[^&]*',
    '',
    'g'
  ),
  '^&',
  ''
)
WHERE surface = 'tickets'
  AND (
    query ~ '(^|&)sort=priority_(desc|asc)(&|$)'
    OR query ~ '(^|&)urgency='
  );
