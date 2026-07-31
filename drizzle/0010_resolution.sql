-- Backs the "Mark Resolved" modal on the admin ticket detail page: an
-- optional field-team proof photo and completion notes captured at the
-- moment a ticket transitions to Resolved. Applied via
-- scripts/migrate-resolution.ts.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_image_url text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes text;
