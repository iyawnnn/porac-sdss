-- Manuscript revision Phase 2, step 2d: the manuscript's ticket-level
-- ACKNOWLEDGMENTS table (Appendix H), backfilled from report_acknowledgments.
--
--   acknowledgments  at most one row per ticket (ticket_id UNIQUE): the
--                    first time Focal acknowledged any report on the
--                    ticket. ticket_id, acknowledged_by_admin_id, remarks,
--                    acknowledged_at. No name column: Appendix H has none,
--                    the name comes from the admin row.
--
-- Separate from tickets.status: acknowledging never changes the status.
-- Since this step FocalIntakeService.acknowledge writes report_acknowledgments
-- and, in the SAME transaction, this table (ON CONFLICT (ticket_id) DO
-- NOTHING, so only the first acknowledged report on a ticket creates the
-- row). Every screen still reads report_acknowledgments; the reads move here
-- in a later phase, after which report_acknowledgments is read-only history
-- until it is dropped in Phase 8.
--
-- Backfill: for each ticket, the EARLIEST report_acknowledgments row among
-- its reports (by acknowledged_at, then id): its admin, remarks and
-- acknowledged_at. A ticket with no acknowledged report gets no row.
--
-- acknowledged_by_admin_id has a real FK to admins(id), as Appendix H
-- defines it — like routing_actions (0037), a deliberate departure from the
-- FK-less actor-snapshot convention of report_acknowledgments: an admin
-- referenced here can no longer be deleted (admins are deactivated, not
-- deleted, in the app).
--
-- The guard (step 1) stops the whole migration, before anything is created,
-- if a report acknowledgment has no admin, names an admin that no longer
-- exists, or belongs to a report with no ticket. No placeholder admins, no
-- skipped rows: those rows are for a person to decide.
--
-- Safe to re-run: the backfill inserts ON CONFLICT (ticket_id) DO NOTHING,
-- so a ticket that already has a row (from a first run, or from the app) is
-- left as it is and a second run inserts 0 rows.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:ticket-acknowledgments
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO block contains ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0038_ticket_acknowledgments.check.sql

-- 1. Guard: every report acknowledgment must map to a real admin and a
-- ticket. RAISE EXCEPTION aborts the transaction, so nothing is kept.
DO $$
DECLARE
  no_admin integer;
  no_ticket integer;
BEGIN
  SELECT count(*) INTO no_admin
  FROM report_acknowledgments ra
  WHERE ra.acknowledged_by_admin_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = ra.acknowledged_by_admin_id);

  SELECT count(*) INTO no_ticket
  FROM report_acknowledgments ra
  WHERE NOT EXISTS (
    SELECT 1 FROM reports r
    JOIN tickets t ON t.id = r.ticket_id
    WHERE r.id = ra.report_id
  );

  IF no_admin + no_ticket > 0 THEN
    RAISE EXCEPTION
      'acknowledgments backfill stopped, nothing was changed: % report acknowledgment(s) with no matching admin, % report acknowledgment(s) whose report has no ticket. Resolve these rows, then run the migration again.',
      no_admin, no_ticket;
  END IF;
END
$$;
--> statement-breakpoint
-- 2. The table. acknowledged_by_admin_id's FK is the Appendix H departure
-- noted above; ticket_id UNIQUE is the one-per-ticket rule.
CREATE TABLE IF NOT EXISTS acknowledgments (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL UNIQUE REFERENCES tickets(id),
  acknowledged_by_admin_id integer NOT NULL REFERENCES admins(id),
  remarks text,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- 3. Backfill the earliest report acknowledgment per ticket.
INSERT INTO acknowledgments (ticket_id, acknowledged_by_admin_id, remarks, acknowledged_at)
SELECT DISTINCT ON (r.ticket_id)
  r.ticket_id, ra.acknowledged_by_admin_id, ra.remarks, ra.acknowledged_at
FROM report_acknowledgments ra
JOIN reports r ON r.id = ra.report_id
ORDER BY r.ticket_id, ra.acknowledged_at, ra.id
ON CONFLICT (ticket_id) DO NOTHING;
