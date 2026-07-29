import { sql } from "../lib/db/raw";

// Backs the /admin/flagged moderation workspace: dismiss/quarantine/duplicate
// actions and the KPI bar (pending/quarantined/dismissed counts, average
// resolution time) all read and write these columns.
async function main() {
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderation_status text`;
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderation_note text`;
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderated_at timestamptz`;
  await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS moderated_by text`;
  console.log("reports.moderation_status/moderation_note/moderated_at/moderated_by applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
