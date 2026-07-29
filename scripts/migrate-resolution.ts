import { sql } from "../lib/db/raw";

// Backs the "Mark Resolved" modal on the admin ticket detail page: an
// optional field-team proof photo and completion notes captured at the
// moment a ticket transitions to Resolved.
async function main() {
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_image_url text`;
  await sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_notes text`;
  console.log("tickets.resolution_image_url/resolution_notes applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
