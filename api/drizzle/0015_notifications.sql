-- Persistent in-app notifications (admin + citizen), polled by both shells.
-- recipient_id (specific admin_id/citizen_id, depending on recipient_type)
-- and recipient_office (admin-only, office-wide, read at query time by
-- every admin in that office — no per-admin fan-out rows) are mutually
-- exclusive per row. Applied via scripts/migrations/migrate-notifications.ts.
DO $$ BEGIN
  CREATE TYPE notification_recipient_type AS ENUM ('admin', 'citizen');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  recipient_type notification_recipient_type NOT NULL,
  recipient_id integer,
  recipient_office office,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  href text,
  entity_type text,
  entity_id integer,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual-recipient unread/list queries (citizen, or a specific admin).
CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (recipient_type, recipient_id, read_at, created_at DESC);

-- Office-wide admin queries.
CREATE INDEX IF NOT EXISTS notifications_office_idx
  ON notifications (recipient_type, recipient_office, read_at, created_at DESC);
