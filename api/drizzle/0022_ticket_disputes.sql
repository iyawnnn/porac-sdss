-- Citizen resolution-feedback loop: lets a citizen report that a Resolved
-- ticket isn't actually fixed, without rolling ticket.status back to an
-- earlier state (see docs/project-status.md). disputed_at is the "is this
-- ticket currently disputed" gate (NULL = not disputed); dispute_reason is
-- the citizen's own words, shown to admins on Ticket Detail. Applied via
-- scripts/migrations/migrate-ticket-disputes.ts.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS disputed_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS dispute_reason text;
