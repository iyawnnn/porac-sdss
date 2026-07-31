-- Adds the 5th ticket_status value used by the admin queue's reject action,
-- plus a flagged marker surfaced next to tickets with a quarantined report
-- (see lib/admin/moderation.ts). Applied via scripts/migrate-diverse-demo.ts.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value, but it can share a transaction with
-- unrelated DDL — postgres.js's sql.unsafe() runs this file as a single
-- implicit transaction, which is safe here for that reason.
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'Rejected';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
