-- Append-only Focal intake activity trail (screened/forwarded/escalated —
-- see api/src/db/schema.ts's reportIntakeActions and
-- FocalIntakeService.deriveIntakeState). Never a mutable status column: the
-- display intake state is always derived from this table plus
-- report_acknowledgments at query time, so these concepts can never become
-- a second TicketStatus. action_type is plain text (validated in the
-- service layer against a TS union), matching notifications.type's and
-- admin_audit_events.action_type's existing text-column convention for a
-- still-evolving vocabulary.
CREATE TABLE IF NOT EXISTS report_intake_actions (
  id serial PRIMARY KEY,
  report_id integer NOT NULL REFERENCES reports(id),
  action_type text NOT NULL,
  actor_admin_id integer,
  actor_name text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_intake_actions_report_id_idx
  ON report_intake_actions (report_id);
