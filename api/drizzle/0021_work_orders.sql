-- Office work orders: the actual field work MEO/MDRRMO must do to resolve a
-- ticket. Independent of ticket_status (own work_order_status enum) — no
-- trigger or app code couples the two. Never exposed to citizens. Applied
-- via scripts/migrations/migrate-work-orders.ts.
DO $$ BEGIN
  CREATE TYPE work_order_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS work_orders (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  title text NOT NULL,
  notes text,
  assigned_office office NOT NULL,
  assigned_admin_id integer,
  status work_order_status NOT NULL DEFAULT 'pending',
  due_date timestamptz,
  created_by_admin_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS work_orders_ticket_idx ON work_orders (ticket_id);
CREATE INDEX IF NOT EXISTS work_orders_office_status_idx ON work_orders (assigned_office, status);
CREATE INDEX IF NOT EXISTS work_orders_due_date_idx ON work_orders (due_date);
