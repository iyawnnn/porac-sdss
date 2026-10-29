-- Manuscript revision Phase 4, step 4b: DENR-MGB Hazard Information
-- (manuscript pp. 71-72, Appendix H HAZARD_INFORMATION).
--
--   hazard_information  one row per lookup of a ticket's representative
--                       location against a DENR-MGB susceptibility layer.
--                       id, ticket_id (FK tickets), hazard_context_type
--                       (FLOOD | RAIN_INDUCED_LANDSLIDE), lookup_status
--                       (CLASSIFIED | NO_CLASSIFICATION |
--                       TEMPORARILY_UNAVAILABLE), susceptibility_code,
--                       susceptibility_label, query_geom geometry(Point,
--                       4326), failure_reason, looked_up_at, superseded_at.
--
-- Localized Flooding tickets are looked up against the Detailed Flood
-- Susceptibility layer, Rain-Induced Slope Failure/Landslide tickets against
-- the Detailed Rain-Induced Landslide Susceptibility layer. Lahar or Volcanic
-- Debris-Flow Threat gets no automated classification in this version and
-- every other category is "not applicable": neither ever gets a row.
--
-- The source's own susceptibility code and wording are stored as they are.
-- Hazard Information is advisory: it is never a PORAC-SDSS risk, urgency,
-- severity or score, and it never feeds Operational Priority, report
-- validity, Work Orders or assessments.
--
-- A new lookup (location correction, category change, retry) supersedes the
-- ticket's current row for that context type (superseded_at set) and the
-- old row stays as history. The partial unique index
-- hazard_information_current_unique allows at most one current row
-- (superseded_at IS NULL) per (ticket_id, hazard_context_type).
--
-- Three named CHECK rules:
--   hazard_information_classified_check     CLASSIFIED has a
--                                           susceptibility_code;
--   hazard_information_no_classification_check
--                                           NO_CLASSIFICATION has no code
--                                           and no label;
--   hazard_information_unavailable_check    TEMPORARILY_UNAVAILABLE has a
--                                           non-empty failure_reason and no
--                                           code or label.
--
-- The table starts empty: nothing is backfilled here. Existing tickets are
-- looked up by the separate backfill script (backfill:hazard-information).
-- Every statement is guarded (IF NOT EXISTS), so a second run changes 0 rows.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:hazard-information
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0043_hazard_information.check.sql

-- 1. The hazard context enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'hazard_context_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE hazard_context_type AS ENUM ('FLOOD', 'RAIN_INDUCED_LANDSLIDE');
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The lookup status enum.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'hazard_lookup_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE hazard_lookup_status AS ENUM (
      'CLASSIFIED', 'NO_CLASSIFICATION', 'TEMPORARILY_UNAVAILABLE'
    );
  END IF;
END
$$;
--> statement-breakpoint
-- 3. The table, with the three CHECK rules.
CREATE TABLE IF NOT EXISTS hazard_information (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  hazard_context_type hazard_context_type NOT NULL,
  lookup_status hazard_lookup_status NOT NULL,
  susceptibility_code varchar(20),
  susceptibility_label varchar(100),
  query_geom geometry(Point, 4326) NOT NULL,
  failure_reason text,
  looked_up_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CONSTRAINT hazard_information_classified_check CHECK (
    lookup_status <> 'CLASSIFIED' OR susceptibility_code IS NOT NULL
  ),
  CONSTRAINT hazard_information_no_classification_check CHECK (
    lookup_status <> 'NO_CLASSIFICATION'
    OR (susceptibility_code IS NULL AND susceptibility_label IS NULL)
  ),
  CONSTRAINT hazard_information_unavailable_check CHECK (
    lookup_status <> 'TEMPORARILY_UNAVAILABLE'
    OR (
      failure_reason IS NOT NULL AND btrim(failure_reason) <> ''
      AND susceptibility_code IS NULL AND susceptibility_label IS NULL
    )
  )
);
--> statement-breakpoint
-- 4. At most one current row per ticket and context type. Superseded rows
-- are history and are not limited.
CREATE UNIQUE INDEX IF NOT EXISTS hazard_information_current_unique
  ON hazard_information (ticket_id, hazard_context_type)
  WHERE superseded_at IS NULL;
--> statement-breakpoint
-- 5. Index on ticket_id (Ticket Detail reads a ticket's current row and
-- history).
CREATE INDEX IF NOT EXISTS hazard_information_ticket_id_idx
  ON hazard_information (ticket_id);
--> statement-breakpoint
-- 6. GiST index on query_geom, as every other geometry column has.
CREATE INDEX IF NOT EXISTS hazard_information_query_geom_idx
  ON hazard_information USING GIST (query_geom);
