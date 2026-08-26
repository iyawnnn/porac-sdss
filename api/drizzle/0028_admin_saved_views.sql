-- Per-admin saved filter presets for the Ticket Queue's view-tab strip.
--
-- A saved view is PERSONAL, never office-wide: admin_id is the owner and the
-- only read/write key, so two admins in the same office never see each other's
-- presets. ON DELETE CASCADE because a deleted admin's private presets have no
-- meaning to anyone else — unlike status_history/admin_audit_events, which
-- deliberately keep an unreferenced admin_id so history survives.
--
-- `query` stores the serialized querystring (e.g. "status=active&urgency=High")
-- rather than parsed columns, so adding a new queue filter never needs a
-- migration here. It is re-parsed through TicketsService.parseTicketQuery on
-- read, which is what keeps a stale or hand-edited preset from widening office
-- scope — the stored string is a suggestion, resolveOfficeScope is the gate.
CREATE TABLE IF NOT EXISTS admin_saved_views (
  id          serial PRIMARY KEY,
  admin_id    integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name        text NOT NULL,
  query       text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Every read is "all views for this admin, in display order".
CREATE INDEX IF NOT EXISTS admin_saved_views_admin_id_position_idx
  ON admin_saved_views (admin_id, position, id);

-- One admin cannot have two presets with the same name; re-saving a name
-- overwrites rather than accumulating near-duplicate tabs.
CREATE UNIQUE INDEX IF NOT EXISTS admin_saved_views_admin_id_name_key
  ON admin_saved_views (admin_id, name);
