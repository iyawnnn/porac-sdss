-- Account & Security page support: tracks when a citizen's password was
-- last set/changed, plus an append-only audit trail for sensitive account
-- actions (provider link/unlink, password set/change, rejected link
-- conflicts). Applied via
-- scripts/migrations/migrate-citizen-account-security.ts.
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS citizen_audit_events (
  id serial PRIMARY KEY,
  citizen_id integer NOT NULL REFERENCES citizens(id),
  event_type text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citizen_audit_events_citizen_idx
  ON citizen_audit_events (citizen_id, created_at);
