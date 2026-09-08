-- Central Monitoring / Focal Personnel's report-level acknowledgment (see
-- api/src/db/schema.ts's reportAcknowledgments and FocalIntakeService).
-- report_id UNIQUE is the acknowledge-once enforcement — the service maps
-- the resulting unique-violation to a 409, never a second row. FK-less
-- acknowledged_by_admin_id + acknowledged_by_name snapshot mirrors
-- status_history/office_reassignments' existing actor-snapshot convention.
CREATE TABLE IF NOT EXISTS report_acknowledgments (
  id serial PRIMARY KEY,
  report_id integer NOT NULL UNIQUE REFERENCES reports(id),
  acknowledged_by_admin_id integer,
  acknowledged_by_name text,
  remarks text,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
