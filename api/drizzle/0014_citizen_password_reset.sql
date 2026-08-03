-- Forgot Password support: session invalidation point on citizens, a
-- single-use/short-lived reset token table (only a hash of the token is
-- ever stored), and a dedicated rate-limit counter table for the
-- forgot-password request endpoint. Applied via
-- scripts/migrations/migrate-citizen-password-reset.ts.
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS session_valid_after timestamptz;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id serial PRIMARY KEY,
  citizen_id integer NOT NULL REFERENCES citizens(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_idx
  ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_citizen_idx
  ON password_reset_tokens (citizen_id, created_at);

CREATE TABLE IF NOT EXISTS password_reset_rate_limit_events (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  email_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_rate_limit_ip_idx
  ON password_reset_rate_limit_events (ip, created_at);
CREATE INDEX IF NOT EXISTS password_reset_rate_limit_email_idx
  ON password_reset_rate_limit_events (email_normalized, created_at);
