ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS session_valid_after timestamptz;
