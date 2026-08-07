ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
