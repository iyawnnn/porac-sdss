-- Manuscript revision Phase 7, step 7b-1: audit actor Focal snapshot and
-- database-enforced append-only history. Step 2 will write actor_is_focal.
-- Nullable boolean, no default and NO backfill: NULL means "not recorded".
-- No existing audit row is updated; actor_role stays permanently.
--
-- actor_admin_id and target_id are deliberately FK-less snapshots. No
-- incoming/outgoing audit FKs exist, so parent deletes cannot cascade here.
-- BEFORE UPDATE OR DELETE, FOR EACH ROW blocks every row mutation, including
-- no-op updates. INSERT stays allowed (including the existing 0039 insert
-- trigger). TRUNCATE is deliberately NOT blocked: dev/test resets use it.
-- Known incompatible caller: seed-demo-presentation.ts deletes audit rows;
-- it must be fixed in step 2 before running that seed again.
--
-- Idempotent: IF NOT EXISTS plus CREATE OR REPLACE FUNCTION and trigger
-- drop/create leave the same behavior and data on a second run.
-- Run through the script for ONE transaction and before/after check counts:
--   pnpm --prefix api migrate:audit-append-only
-- By hand, wrap this file in BEGIN/COMMIT yourself. Statements use Drizzle
-- statement-breakpoint comments because the function contains semicolons.
-- Before/after check: api/drizzle/0047_audit_append_only.check.sql

ALTER TABLE admin_audit_events
  ADD COLUMN IF NOT EXISTS actor_is_focal boolean;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_audit_events_reject_update_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events is append-only: UPDATE and DELETE are not allowed';
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS admin_audit_events_append_only ON admin_audit_events;
--> statement-breakpoint
CREATE TRIGGER admin_audit_events_append_only
BEFORE UPDATE OR DELETE ON admin_audit_events
FOR EACH ROW EXECUTE FUNCTION admin_audit_events_reject_update_delete();
