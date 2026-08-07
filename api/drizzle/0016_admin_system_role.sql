-- Adds the System Administrator role used for cross-office/full-city admin
-- access (see api/src/common/authz/admin-scope.ts). system_admin has no
-- office of its own, so admins.office becomes nullable rather than adding a
-- third "ALL" office value — office keeps meaning "the one office this
-- admin belongs to" for officer/supervisor rows.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value, but it can share a transaction with
-- unrelated DDL — postgres.js's sql.unsafe() runs this file as a single
-- implicit transaction, which is safe here for that reason (same note as
-- 0011_ticket_rejected_flagged.sql).
ALTER TYPE admin_role ADD VALUE IF NOT EXISTS 'system_admin';
ALTER TABLE admins ALTER COLUMN office DROP NOT NULL;
