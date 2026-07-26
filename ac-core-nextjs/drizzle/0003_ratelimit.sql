-- Postgres-backed rate limit store — see lib/ratelimit.ts for why (not
-- in-memory, not Upstash Redis).
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id serial PRIMARY KEY,
  ip text NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_ip_idx ON rate_limit_events (ip, created_at);
CREATE INDEX IF NOT EXISTS rate_limit_events_geom_idx ON rate_limit_events USING GIST (geom);
