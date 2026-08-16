CREATE TABLE IF NOT EXISTS citizen_login_rate_limit_events (
  id serial PRIMARY KEY,
  email_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citizen_login_rate_limit_email_idx ON citizen_login_rate_limit_events (email_normalized, created_at);

CREATE TABLE IF NOT EXISTS citizen_signup_rate_limit_events (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citizen_signup_rate_limit_ip_idx ON citizen_signup_rate_limit_events (ip, created_at);
