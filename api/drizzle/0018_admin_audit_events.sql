CREATE TABLE IF NOT EXISTS admin_audit_events (
  id serial PRIMARY KEY,
  actor_admin_id integer NOT NULL,
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  actor_role admin_role NOT NULL,
  actor_office office,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id integer NOT NULL,
  target_summary text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx
  ON admin_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_actor_idx
  ON admin_audit_events (actor_admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_events_target_idx
  ON admin_audit_events (target_type, target_id);
