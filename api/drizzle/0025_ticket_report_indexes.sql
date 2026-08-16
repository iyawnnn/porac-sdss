CREATE INDEX IF NOT EXISTS reports_ticket_id_idx ON reports (ticket_id);
CREATE INDEX IF NOT EXISTS tickets_office_status_idx ON tickets (assigned_office, status);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS reports_citizen_id_idx ON reports (citizen_id);
CREATE INDEX IF NOT EXISTS reports_moderation_status_idx ON reports (moderation_status);
CREATE INDEX IF NOT EXISTS tickets_barangay_id_idx ON tickets (barangay_id);
