-- Manuscript revision Phase 2, step 2c: the manuscript's ROUTING_ACTIONS
-- table (Appendix H), backfilled from the existing reassignment and referral
-- history.
--
--   routing_actions  one row per office reassignment (REASSIGN) or external
--                    referral (REFER): ticket_id, action_type, from_office,
--                    to_office, referral_target, reason, admin_id,
--                    admin_name, created_at.
--
-- Since this step the app writes a routing_actions row in the SAME
-- transaction as every office_reassignments insert (TicketsService
-- .reassignOffice, including Focal's Forward) and every ticket_referral_noted
-- audit event (TicketsService.logReferral). Every screen still reads the old
-- tables; the reads move here in Phase 5.
--
-- Backfill:
--   REASSIGN  one row per office_reassignments row: same from/to office,
--             admin_id, admin_name = the snapshot name, else the admin's
--             current name; created_at = reassigned_at; no referral_target.
--   REFER     one row per ticket_referral_noted audit event on a ticket:
--             referral_target = metadata.agency; to_office NULL; from_office =
--             the to_office of the ticket's latest reassignment at or before
--             the event, else tickets.initial_assigned_office (migration 0036,
--             so 0037 must run after it); admin from the event's actor;
--             created_at = the event's created_at.
--   reason    the referral note when there is one; otherwise, and for every
--             reassignment, 'Reason not recorded (before reasons were
--             required)' (ROUTING_REASON_NOT_RECORDED in api/src/db/schema.ts;
--             reasons become required in Phase 5).
--
-- admin_id has a real FK to admins(id), as Appendix H defines it. That is a
-- deliberate departure from the FK-less actor-snapshot convention of
-- office_reassignments, status_history and admin_audit_events: an admin
-- referenced here can no longer be deleted (admins are deactivated, not
-- deleted, in the app).
--
-- The guard (step 2) stops the whole migration, before anything is created,
-- if a source row has no admin, names an admin that no longer exists, has a
-- name over 100 characters, points at a ticket that no longer exists, or has
-- an agency over 255 characters. No placeholder admins, no skipped rows:
-- those rows are for a person to decide.
--
-- Safe to re-run: each backfill inserts only rows with no routing_actions
-- row of the same ticket_id, action_type, created_at, from_office, to_office
-- and referral_target, and the app's own writes share that key (same
-- transaction, same now()), so a second run inserts 0 rows.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:routing-actions
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0037_routing_actions.check.sql

-- 1. The action type enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'routing_action_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE routing_action_type AS ENUM ('REASSIGN', 'REFER');
  END IF;
END
$$;
--> statement-breakpoint
-- 2. Guard: every source row must map to a real admin, a name that fits
-- varchar(100), an existing ticket and an agency that fits varchar(255).
-- RAISE EXCEPTION aborts the transaction, so nothing above is kept either.
DO $$
DECLARE
  reassign_no_admin integer;
  refer_no_admin integer;
  name_too_long integer;
  refer_no_ticket integer;
  agency_too_long integer;
BEGIN
  SELECT count(*) INTO reassign_no_admin
  FROM office_reassignments r
  WHERE r.admin_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = r.admin_id);

  SELECT count(*) INTO refer_no_admin
  FROM admin_audit_events e
  WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
    AND (
      e.actor_admin_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM admins a WHERE a.id = e.actor_admin_id)
    );

  SELECT
    (
      SELECT count(*)
      FROM office_reassignments r
      LEFT JOIN admins a ON a.id = r.admin_id
      WHERE length(COALESCE(r.admin_name, a.first_name || ' ' || a.last_name)) > 100
    ) + (
      SELECT count(*)
      FROM admin_audit_events e
      LEFT JOIN admins a ON a.id = e.actor_admin_id
      WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
        AND length(COALESCE(e.actor_name, a.first_name || ' ' || a.last_name)) > 100
    )
  INTO name_too_long;

  SELECT count(*) INTO refer_no_ticket
  FROM admin_audit_events e
  WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
    AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = e.target_id);

  SELECT count(*) INTO agency_too_long
  FROM admin_audit_events e
  WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
    AND length(e.metadata ->> 'agency') > 255;

  IF reassign_no_admin + refer_no_admin + name_too_long + refer_no_ticket + agency_too_long > 0 THEN
    RAISE EXCEPTION
      'routing_actions backfill stopped, nothing was changed: % reassignment(s) with no matching admin, % referral(s) with no matching admin, % admin name(s) over 100 characters, % referral(s) on a ticket that no longer exists, % agency name(s) over 255 characters. Resolve these rows, then run the migration again.',
      reassign_no_admin, refer_no_admin, name_too_long, refer_no_ticket, agency_too_long;
  END IF;
END
$$;
--> statement-breakpoint
-- 3. The table. admin_id's FK is the Appendix H departure noted above.
CREATE TABLE IF NOT EXISTS routing_actions (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  action_type routing_action_type NOT NULL,
  from_office office,
  to_office office,
  referral_target varchar(255),
  reason text NOT NULL,
  admin_id integer NOT NULL REFERENCES admins(id),
  admin_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS routing_actions_ticket_id_created_at_idx ON routing_actions (ticket_id, created_at);
--> statement-breakpoint
-- 4. Backfill REASSIGN from office_reassignments.
INSERT INTO routing_actions (
  ticket_id, action_type, from_office, to_office, referral_target, reason, admin_id, admin_name, created_at
)
SELECT
  r.ticket_id, 'REASSIGN', r.from_office, r.to_office, NULL,
  'Reason not recorded (before reasons were required)',
  r.admin_id, COALESCE(r.admin_name, a.first_name || ' ' || a.last_name), r.reassigned_at
FROM office_reassignments r
JOIN admins a ON a.id = r.admin_id
WHERE NOT EXISTS (
  SELECT 1 FROM routing_actions ra
  WHERE ra.ticket_id = r.ticket_id
    AND ra.action_type = 'REASSIGN'
    AND ra.created_at = r.reassigned_at
    AND ra.from_office IS NOT DISTINCT FROM r.from_office
    AND ra.to_office IS NOT DISTINCT FROM r.to_office
    AND ra.referral_target IS NULL
)
ORDER BY r.reassigned_at, r.id;
--> statement-breakpoint
-- 5. Backfill REFER from the ticket_referral_noted audit events.
INSERT INTO routing_actions (
  ticket_id, action_type, from_office, to_office, referral_target, reason, admin_id, admin_name, created_at
)
SELECT
  src.ticket_id, 'REFER', src.from_office, NULL, src.referral_target, src.reason,
  src.admin_id, src.admin_name, src.created_at
FROM (
  SELECT
    e.target_id AS ticket_id,
    COALESCE(
      (
        SELECT r.to_office
        FROM office_reassignments r
        WHERE r.ticket_id = e.target_id AND r.reassigned_at <= e.created_at
        ORDER BY r.reassigned_at DESC, r.id DESC
        LIMIT 1
      ),
      t.initial_assigned_office
    ) AS from_office,
    e.metadata ->> 'agency' AS referral_target,
    COALESCE(
      NULLIF(btrim(e.metadata ->> 'note'), ''),
      'Reason not recorded (before reasons were required)'
    ) AS reason,
    e.actor_admin_id AS admin_id,
    COALESCE(e.actor_name, a.first_name || ' ' || a.last_name) AS admin_name,
    e.created_at,
    e.id AS event_id
  FROM admin_audit_events e
  JOIN tickets t ON t.id = e.target_id
  JOIN admins a ON a.id = e.actor_admin_id
  WHERE e.action_type = 'ticket_referral_noted' AND e.target_type = 'ticket'
) src
WHERE NOT EXISTS (
  SELECT 1 FROM routing_actions ra
  WHERE ra.ticket_id = src.ticket_id
    AND ra.action_type = 'REFER'
    AND ra.created_at = src.created_at
    AND ra.from_office IS NOT DISTINCT FROM src.from_office
    AND ra.to_office IS NULL
    AND ra.referral_target IS NOT DISTINCT FROM src.referral_target
)
ORDER BY src.created_at, src.event_id;
