-- Saved views become per-surface.
--
-- 0028 created admin_saved_views for the Ticket Queue only, so a row's owner
-- (admin_id) was the whole key. The Flagged Reports queue now saves presets
-- through the same table, and a preset written against one surface's filters
-- is meaningless on the other — replaying `status=quarantined&flag=NO_EXIF`
-- on /admin/tickets would silently resolve to no filters at all. `surface`
-- keeps the two strips disjoint.
--
-- DEFAULT 'tickets' is what backfills every existing row: every preset that
-- exists when this runs was necessarily saved from the Ticket Queue, since
-- that was the only surface able to write one.
--
-- The CHECK is deliberately a closed list rather than free text. A typo'd
-- surface would not error — it would create a third, invisible strip whose
-- rows still count against the caller's per-surface cap.
ALTER TABLE admin_saved_views
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'tickets';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_saved_views_surface_check'
  ) THEN
    ALTER TABLE admin_saved_views
      ADD CONSTRAINT admin_saved_views_surface_check
      CHECK (surface IN ('tickets', 'flagged'));
  END IF;
END $$;

-- Both indexes from 0028 are replaced rather than supplemented: each one's
-- leading (admin_id, ...) prefix is now too broad. Leaving the old unique
-- index in place would be the actual bug — it would stop an admin from
-- saving "Needs review" on Flagged Reports because they already have a view
-- by that name on the Ticket Queue.
DROP INDEX IF EXISTS admin_saved_views_admin_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS admin_saved_views_admin_id_surface_name_key
  ON admin_saved_views (admin_id, surface, name);

DROP INDEX IF EXISTS admin_saved_views_admin_id_position_idx;
CREATE INDEX IF NOT EXISTS admin_saved_views_admin_id_surface_position_idx
  ON admin_saved_views (admin_id, surface, position, id);
