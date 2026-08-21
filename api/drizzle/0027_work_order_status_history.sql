-- Append-only status timeline for work orders, mirroring status_history's
-- role for tickets. work_orders itself stores only the *current* status, so
-- before this table there was no way to answer "how many work orders were
-- pending on date X" — a pending -> in_progress transition left no trace.
-- The dashboard's Pending Work Orders sparkline reads this table.
--
-- Deliberately its own table rather than a column on work_orders, and its
-- own enum reference (work_order_status, not ticket_status) — same reasoning
-- as status_history vs office_reassignments in schema.ts: a work order's
-- progress is not a ticket resolution state.
--
-- No FK on admin_id: same cross-table reasoning as status_history.admin_id
-- and office_reassignments.admin_id. admin_name is a snapshot at write time
-- so the trail reads correctly after an admin is renamed or deactivated.
--
-- Applied via scripts/migrations/migrate-work-order-status-history.ts.
CREATE TABLE IF NOT EXISTS work_order_status_history (
  id serial PRIMARY KEY,
  work_order_id integer NOT NULL REFERENCES work_orders(id),
  status work_order_status NOT NULL,
  admin_id integer,
  admin_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- The trend query walks history per work order ordered by time, and filters
-- by date window; this composite covers both.
CREATE INDEX IF NOT EXISTS work_order_status_history_order_time_idx
  ON work_order_status_history (work_order_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS work_order_status_history_changed_at_idx
  ON work_order_status_history (changed_at);

-- Seed an origin row for every work order that predates this table, using
-- its creation time and 'pending' (the column default every work order is
-- born with — see work-orders.service.ts createWorkOrder, which never
-- overrides status on INSERT). This is NOT a reconstruction of real past
-- transitions, which are unrecoverable: it only gives each existing work
-- order a defined starting point so the as-of query returns a coherent
-- series instead of dropping pre-existing rows entirely. Dates before a
-- work order's created_at correctly contribute nothing.
INSERT INTO work_order_status_history (work_order_id, status, admin_name, changed_at)
SELECT wo.id, 'pending'::work_order_status, NULL, wo.created_at
FROM work_orders wo
WHERE NOT EXISTS (
  SELECT 1 FROM work_order_status_history h WHERE h.work_order_id = wo.id
);
