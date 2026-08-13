-- Per-account failed-login throttling for admin login (R1). Deliberately
-- separate from password_reset_rate_limit_events even though the shape is
-- identical — that table is a different security domain already in active
-- use by citizen forgot-password requests, and mixing rows would corrupt
-- both tables' counts. See docs/database.md §D/§G.
CREATE TABLE IF NOT EXISTS admin_login_rate_limit_events (
  id serial PRIMARY KEY,
  email_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_rate_limit_events_email_idx ON admin_login_rate_limit_events (email_normalized, created_at);
