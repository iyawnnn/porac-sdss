-- Manuscript revision Phase 2, step 2e: the manuscript's staff account
-- fields (Appendix H ADMINS) and the audit actor's account type.
--
--   admins.account_type   admin_account_type ('PERSONNEL' | 'SYSTEM_ADMIN')
--   admins.is_focal       boolean
--   admin_audit_events.actor_account_type
--                         admin_account_type, beside the historical
--                         actor_role (an implementation extension: Appendix
--                         H has the account type, this table also keeps the
--                         role it was written with)
--
-- Mapping from the old admins.role:
--   officer      -> PERSONNEL,    same office,   is_focal false
--   supervisor   -> PERSONNEL,    same office,   is_focal false
--   focal        -> PERSONNEL,    office MDRRMO, is_focal true
--   system_admin -> SYSTEM_ADMIN, office NULL,   is_focal false
-- Officer and supervisor had identical permissions everywhere, so both
-- become plain Personnel. Access stays exactly the same: the app now
-- decides it from account_type / office / is_focal instead of role.
--
-- admins.role and admin_audit_events.actor_role stay as they are (still
-- NOT NULL): role is kept in sync by the app as a mirror nobody reads for
-- access, actor_role is history and is never rewritten. Both are dropped in
-- Phase 8.
--
-- The CHECK rule (admins_account_type_office_focal_check):
--   a System Administrator has no office and is not Focal;
--   Personnel always has an office, and only MDRRMO Personnel can be Focal.
-- account_type and is_focal have no defaults: the app always sets them.
--
-- One-time logout: the backfill sets session_valid_after = now() in the
-- same UPDATE that maps an account, so every staff member is logged out
-- once and logs in again with a session that carries the new fields. Only
-- the run that maps an account logs it out: a second run updates 0 rows.
--
-- Older code against the migrated database: it still logs in and works.
-- Its audit inserts don't set actor_account_type, so a BEFORE INSERT
-- trigger fills it from actor_role when an insert leaves it NULL (the new
-- code always sets it). Only creating a staff account fails until the new
-- code runs, because account_type and is_focal are NOT NULL with no
-- default.
--
-- The guard (step 2) stops the whole migration, before anything is
-- changed, if an admin can't be mapped cleanly: an officer/supervisor with
-- no office, a focal on MEO, or a system_admin with an office. Nothing is
-- guessed: those accounts are for a person to fix.
--
-- Run it through the migrate script, which runs every statement in ONE
-- transaction and prints before/after counts:
--   pnpm --prefix api migrate:staff-account-types
-- Applying this file by hand, wrap it in BEGIN/COMMIT yourself.
--
-- Statements are separated by Drizzle's statement-breakpoint comments (the
-- DO blocks contain ';', so the script can't split on line-ending
-- semicolons).
--
-- Before/after check: api/drizzle/0039_staff_account_types.check.sql

-- 1. The account type enum. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'admin_account_type' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE admin_account_type AS ENUM ('PERSONNEL', 'SYSTEM_ADMIN');
  END IF;
END
$$;
--> statement-breakpoint
-- 2. Guard: every admin must map cleanly. Reads only role and office, so it
-- works before the new columns exist. RAISE EXCEPTION aborts the
-- transaction, so nothing above is kept either.
DO $$
DECLARE
  personnel_without_office integer;
  focal_on_meo integer;
  system_admin_with_office integer;
BEGIN
  SELECT count(*) INTO personnel_without_office
  FROM admins WHERE role IN ('officer', 'supervisor') AND office IS NULL;

  SELECT count(*) INTO focal_on_meo
  FROM admins WHERE role = 'focal' AND office = 'MEO';

  SELECT count(*) INTO system_admin_with_office
  FROM admins WHERE role = 'system_admin' AND office IS NOT NULL;

  IF personnel_without_office + focal_on_meo + system_admin_with_office > 0 THEN
    RAISE EXCEPTION
      'staff account types stopped, nothing was changed: % officer/supervisor account(s) with no office, % focal account(s) on MEO, % system_admin account(s) with an office. Fix these accounts, then run the migration again.',
      personnel_without_office, focal_on_meo, system_admin_with_office;
  END IF;
END
$$;
--> statement-breakpoint
-- 3. The new admins columns, nullable until the backfill below.
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS account_type admin_account_type,
  ADD COLUMN IF NOT EXISTS is_focal boolean;
--> statement-breakpoint
-- 4. Map every admin not mapped yet, and log it out in the same UPDATE. A
-- focal with no office moves to MDRRMO (the guard has already stopped a
-- focal on MEO). The CASE lists every role, so a role this file doesn't
-- know would leave NULL and fail step 5 instead of being guessed.
UPDATE admins SET
  account_type = CASE role
    WHEN 'officer' THEN 'PERSONNEL'
    WHEN 'supervisor' THEN 'PERSONNEL'
    WHEN 'focal' THEN 'PERSONNEL'
    WHEN 'system_admin' THEN 'SYSTEM_ADMIN'
  END::admin_account_type,
  is_focal = CASE role
    WHEN 'officer' THEN false
    WHEN 'supervisor' THEN false
    WHEN 'focal' THEN true
    WHEN 'system_admin' THEN false
  END,
  office = CASE WHEN role = 'focal' THEN 'MDRRMO'::office ELSE office END,
  session_valid_after = now()
WHERE account_type IS NULL;
--> statement-breakpoint
-- 5. No defaults: the app always sets both. SET NOT NULL is a no-op when
-- already set.
ALTER TABLE admins
  ALTER COLUMN account_type SET NOT NULL,
  ALTER COLUMN is_focal SET NOT NULL;
--> statement-breakpoint
-- 6. The CHECK rule. ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admins_account_type_office_focal_check'
      AND conrelid = 'admins'::regclass
  ) THEN
    ALTER TABLE admins ADD CONSTRAINT admins_account_type_office_focal_check CHECK (
      (account_type = 'SYSTEM_ADMIN' AND office IS NULL AND is_focal = false)
      OR (account_type = 'PERSONNEL' AND office IS NOT NULL AND (is_focal = false OR office = 'MDRRMO'))
    );
  END IF;
END
$$;
--> statement-breakpoint
-- 7. The audit actor's account type, nullable until the fill below.
ALTER TABLE admin_audit_events
  ADD COLUMN IF NOT EXISTS actor_account_type admin_account_type;
--> statement-breakpoint
-- 8. Fill it from the stored actor_role. actor_role itself is not touched.
UPDATE admin_audit_events SET
  actor_account_type = CASE actor_role
    WHEN 'officer' THEN 'PERSONNEL'
    WHEN 'supervisor' THEN 'PERSONNEL'
    WHEN 'focal' THEN 'PERSONNEL'
    WHEN 'system_admin' THEN 'SYSTEM_ADMIN'
  END::admin_account_type
WHERE actor_account_type IS NULL;
--> statement-breakpoint
-- 9-11. Older code doesn't set actor_account_type; fill it from actor_role
-- on insert so its audit writes keep working. The new code always sets it,
-- and an explicit value is never replaced. Dropped in Phase 8 with
-- actor_role.
CREATE OR REPLACE FUNCTION admin_audit_events_fill_actor_account_type() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.actor_account_type IS NULL THEN
    NEW.actor_account_type := CASE NEW.actor_role
      WHEN 'officer' THEN 'PERSONNEL'
      WHEN 'supervisor' THEN 'PERSONNEL'
      WHEN 'focal' THEN 'PERSONNEL'
      WHEN 'system_admin' THEN 'SYSTEM_ADMIN'
    END::admin_account_type;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS admin_audit_events_fill_actor_account_type ON admin_audit_events;
--> statement-breakpoint
CREATE TRIGGER admin_audit_events_fill_actor_account_type
BEFORE INSERT ON admin_audit_events
FOR EACH ROW EXECUTE FUNCTION admin_audit_events_fill_actor_account_type();
--> statement-breakpoint
-- 12. Appendix H requires it. SET NOT NULL is a no-op when already set.
ALTER TABLE admin_audit_events
  ALTER COLUMN actor_account_type SET NOT NULL;
