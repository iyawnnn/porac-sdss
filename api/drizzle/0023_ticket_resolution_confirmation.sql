-- Citizen resolution-feedback loop, positive path: lets a citizen confirm a
-- Resolved ticket actually was fixed. Same gate shape as disputed_at
-- (0022_ticket_disputes.sql) — resolution_confirmed_at NULL means "not yet
-- confirmed". Applied via scripts/migrations/migrate-ticket-resolution-confirmation.ts.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_confirmed_at timestamptz;
