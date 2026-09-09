-- Batch 3: MEO/MDRRMO's human Operational Assessment — one current row per
-- ticket (see api/src/db/schema.ts's operationalAssessments docblock for the
-- full rationale, including why there are two actor snapshots and no score
-- column anywhere here). Additive only: adds a new table, does not touch or
-- rewrite any existing row in tickets or any other table.
CREATE TABLE IF NOT EXISTS operational_assessments (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL UNIQUE REFERENCES tickets(id),
  assessed_by_admin_id integer,
  assessed_by_name text,
  observed_conditions text NOT NULL DEFAULT '',
  safety_implications text NOT NULL DEFAULT '',
  operational_constraints text[] NOT NULL DEFAULT '{}',
  recommended_action text NOT NULL DEFAULT '',
  temporary_mitigation text NOT NULL DEFAULT '',
  deferment_reason text,
  referral_reason text,
  remarks text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  updated_by_admin_id integer,
  updated_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
