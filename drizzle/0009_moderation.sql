-- Backs the /admin/flagged moderation workspace: dismiss/quarantine/duplicate
-- actions and the KPI bar (pending/quarantined/dismissed counts, average
-- resolution time) all read and write these columns. Applied via
-- scripts/migrate-moderation.ts.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderation_status text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderation_note text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderated_by text;
