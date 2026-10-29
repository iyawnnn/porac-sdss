-- Manuscript revision Phase 3, step 3g: per-citizen resolution feedback
-- (Appendix H RESOLUTION_FEEDBACK).
--
--   resolution_feedback  one row per (ticket, citizen): a citizen with a
--                        report on a Resolved ticket confirms it was fixed
--                        or disputes it. id, ticket_id (FK tickets),
--                        citizen_id (FK citizens), feedback_type
--                        (resolution_feedback_type: CONFIRMED | DISPUTED),
--                        reason, created_at.
--
-- Answers are one-time and locked: UNIQUE (ticket_id, citizen_id), so a
-- citizen answers a ticket once and one citizen's answer never blocks
-- another's. Two named CHECK rules:
--   resolution_feedback_disputed_reason_check   DISPUTED needs a non-empty
--                                               reason;
--   resolution_feedback_confirmed_reason_check  CONFIRMED has reason NULL.
--
-- The old ticket-level columns (tickets.disputed_at, dispute_reason,
-- resolution_confirmed_at) stay as they are until Phase 8. This migration
-- never writes them.
--
-- Backfill: old feedback did not record which citizen gave it, so each
-- ticket with old feedback gets ONE row attributed to the ticket's earliest
-- reporter (earliest report by created_at, then id; that report's citizen).
--   - Disputed (disputed_at set): DISPUTED, reason = dispute_reason,
--     created_at = disputed_at. A ticket that also has resolution_confirmed_at
--     keeps only the dispute: the old code allowed a dispute after a
--     confirmation but not the reverse, so the dispute is the later answer,
--     and one (ticket, citizen) pair can hold only one.
--   - Confirmed only: CONFIRMED, reason NULL, created_at =
--     resolution_confirmed_at.
--   - Skipped, and counted by the check file: a merged-away ticket
--     (merged_into_ticket_id set; its reports moved to the survivor, and no
--     row is ever written against a merged-away id), and a ticket with no
--     report (no citizen to attribute it to). No citizen is invented.
--
-- The guard (step 1) stops the whole migration, before anything is created,
-- if a disputed ticket has no reason: the DISPUTED CHECK would reject its
-- row, and a reason is not invented.
--
-- Safe to re-run: the backfill inserts ON CONFLICT (ticket_id, citizen_id)
-- DO NOTHING, so a second run inserts 0 rows.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:resolution-feedback
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0042_resolution_feedback.check.sql

-- 1. Guard: every old dispute that will be copied has a reason. RAISE
-- EXCEPTION aborts the transaction, so nothing is kept.
DO $$
DECLARE
  no_reason integer;
BEGIN
  SELECT count(*) INTO no_reason
  FROM tickets t
  WHERE t.disputed_at IS NOT NULL
    AND t.merged_into_ticket_id IS NULL
    AND (t.dispute_reason IS NULL OR btrim(t.dispute_reason) = '')
    AND EXISTS (SELECT 1 FROM reports r WHERE r.ticket_id = t.id);

  IF no_reason > 0 THEN
    RAISE EXCEPTION
      'resolution_feedback backfill stopped, nothing was changed: % disputed ticket(s) with no dispute reason. Resolve these rows, then run the migration again.',
      no_reason;
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The feedback type enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'resolution_feedback_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE resolution_feedback_type AS ENUM ('CONFIRMED', 'DISPUTED');
  END IF;
END
$$;
--> statement-breakpoint
-- 3. The table, with the one-answer-per-citizen rule and the two CHECKs.
CREATE TABLE IF NOT EXISTS resolution_feedback (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  citizen_id integer NOT NULL REFERENCES citizens(id),
  feedback_type resolution_feedback_type NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resolution_feedback_ticket_citizen_unique UNIQUE (ticket_id, citizen_id),
  CONSTRAINT resolution_feedback_disputed_reason_check CHECK (
    feedback_type <> 'DISPUTED' OR (reason IS NOT NULL AND btrim(reason) <> '')
  ),
  CONSTRAINT resolution_feedback_confirmed_reason_check CHECK (
    feedback_type <> 'CONFIRMED' OR reason IS NULL
  )
);
--> statement-breakpoint
-- 4. Index on ticket_id (staff ticket detail reads every answer on a ticket).
CREATE INDEX IF NOT EXISTS resolution_feedback_ticket_id_idx
  ON resolution_feedback (ticket_id);
--> statement-breakpoint
-- 5. Index on citizen_id (a citizen's own answer).
CREATE INDEX IF NOT EXISTS resolution_feedback_citizen_id_idx
  ON resolution_feedback (citizen_id);
--> statement-breakpoint
-- 6. Backfill one row per ticket with old feedback, attributed to its
-- earliest reporter. Merged-away tickets and tickets with no report are
-- left out (the JOIN and the WHERE).
INSERT INTO resolution_feedback (ticket_id, citizen_id, feedback_type, reason, created_at)
SELECT DISTINCT ON (t.id)
  t.id,
  r.citizen_id,
  CASE WHEN t.disputed_at IS NOT NULL THEN 'DISPUTED' ELSE 'CONFIRMED' END::resolution_feedback_type,
  CASE WHEN t.disputed_at IS NOT NULL THEN t.dispute_reason END,
  COALESCE(t.disputed_at, t.resolution_confirmed_at)
FROM tickets t
JOIN reports r ON r.ticket_id = t.id
WHERE (t.disputed_at IS NOT NULL OR t.resolution_confirmed_at IS NOT NULL)
  AND t.merged_into_ticket_id IS NULL
ORDER BY t.id, r.created_at, r.id
ON CONFLICT (ticket_id, citizen_id) DO NOTHING;
