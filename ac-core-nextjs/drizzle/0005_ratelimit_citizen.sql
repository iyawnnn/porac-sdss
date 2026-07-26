-- Rate limiting now keys primarily on citizen_id (PLAN.md §9), keeping the
-- IP-based limit as a looser secondary backstop.
ALTER TABLE rate_limit_events ADD COLUMN citizen_id integer REFERENCES citizens(id);
CREATE INDEX IF NOT EXISTS rate_limit_events_citizen_idx ON rate_limit_events (citizen_id, created_at);
