-- Manuscript revision Phase 4, step 4c: per-ticket rainfall context
-- (manuscript p. 72, Appendix H RAINFALL_CONTEXT).
--
--   rainfall_context  one row per rainfall reading kept for a ticket's
--                     current representative location. id, ticket_id (FK
--                     tickets), status (CURRENT | STALE | UNAVAILABLE),
--                     rainfall_mm, source_provider, observation_at,
--                     fetched_at, query_geom geometry(Point, 4326),
--                     failure_reason, superseded_at.
--
-- Rainfall context applies to active Localized Flooding and Rain-Induced
-- Slope Failure/Landslide tickets only, and is kept separately from DENR-MGB
-- Hazard Information. Closed tickets keep their last context as history and
-- are never refreshed. It is advisory and staff-only: it never changes
-- Operational Priority, report validity, Hazard Information or any rule.
--
-- Status meaning:
--   CURRENT      a good reading; rainfall_mm may be 0 (a real "0 mm").
--   STALE        a refresh failed after an earlier good reading: that row is
--                updated in place to STALE, keeping its rainfall_mm,
--                observation_at and fetched_at, with failure_reason saying
--                why the refresh failed.
--   UNAVAILABLE  a fetch failed and there was no earlier value: no
--                rainfall_mm at all (never shown as 0 mm).
--
-- A new reading for a changed location or category supersedes the ticket's
-- current row (superseded_at set) and the old row stays as history. The
-- partial unique index rainfall_context_current_unique allows at most one
-- current row (superseded_at IS NULL) per ticket.
--
-- Three named CHECK rules (0 is valid wherever a value is required; NaN and
-- Infinity are not - Postgres sorts NaN above Infinity, so "< 'Infinity'"
-- rules out both):
--   rainfall_context_current_check      CURRENT has rainfall_mm >= 0 and no
--                                       failure_reason;
--   rainfall_context_stale_check        STALE has rainfall_mm >= 0 and a
--                                       non-blank failure_reason;
--   rainfall_context_unavailable_check  UNAVAILABLE has no rainfall_mm and a
--                                       non-blank failure_reason.
--
-- The table starts empty: nothing is backfilled. Every statement is guarded
-- (IF NOT EXISTS), so a second run changes 0 rows.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:rainfall-context
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO block contains ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0044_rainfall_context.check.sql

-- 1. The status enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'rainfall_context_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE rainfall_context_status AS ENUM ('CURRENT', 'STALE', 'UNAVAILABLE');
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The table, with the three CHECK rules.
CREATE TABLE IF NOT EXISTS rainfall_context (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  status rainfall_context_status NOT NULL,
  rainfall_mm real,
  source_provider varchar(100) NOT NULL,
  observation_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  query_geom geometry(Point, 4326) NOT NULL,
  failure_reason text,
  superseded_at timestamptz,
  CONSTRAINT rainfall_context_current_check CHECK (
    status <> 'CURRENT'
    OR (
      rainfall_mm IS NOT NULL AND rainfall_mm >= 0 AND rainfall_mm < 'Infinity'::real
      AND failure_reason IS NULL
    )
  ),
  CONSTRAINT rainfall_context_stale_check CHECK (
    status <> 'STALE'
    OR (
      rainfall_mm IS NOT NULL AND rainfall_mm >= 0 AND rainfall_mm < 'Infinity'::real
      AND failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
    )
  ),
  CONSTRAINT rainfall_context_unavailable_check CHECK (
    status <> 'UNAVAILABLE'
    OR (
      rainfall_mm IS NULL
      AND failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
    )
  )
);
--> statement-breakpoint
-- 3. At most one current row per ticket. Superseded rows are history and are
-- not limited.
CREATE UNIQUE INDEX IF NOT EXISTS rainfall_context_current_unique
  ON rainfall_context (ticket_id)
  WHERE superseded_at IS NULL;
--> statement-breakpoint
-- 4. Index on ticket_id (Ticket Detail reads a ticket's current row and
-- history).
CREATE INDEX IF NOT EXISTS rainfall_context_ticket_id_idx
  ON rainfall_context (ticket_id);
--> statement-breakpoint
-- 5. GiST index on query_geom, as every other geometry column has.
CREATE INDEX IF NOT EXISTS rainfall_context_query_geom_idx
  ON rainfall_context USING GIST (query_geom);
