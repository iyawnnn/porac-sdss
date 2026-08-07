import bcrypt from "bcryptjs";
import { db, client } from "../db";
import { admins } from "../../src/db/schema";

async function main() {
  const [email, password, office, role, firstName, lastName] = process.argv.slice(2);

  if (!email || !password || !office || !role) {
    console.error(
      "Usage: tsx scripts/seed-admin.ts <email> <password> <MEO|MDRRMO> <officer|supervisor> [firstName] [lastName]"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Upsert by email — idempotent, so re-running this (e.g. re-provisioning
  // a demo account right before a live run) updates the existing account
  // instead of failing on the unique constraint.
  const [admin] = await db
    .insert(admins)
    .values({
      email,
      passwordHash,
      office: office as "MEO" | "MDRRMO",
      role: role as "officer" | "supervisor",
      firstName: firstName ?? "Test",
      lastName: lastName ?? "Admin",
    })
    .onConflictDoUpdate({
      target: admins.email,
      set: {
        passwordHash,
        office: office as "MEO" | "MDRRMO",
        role: role as "officer" | "supervisor",
        firstName: firstName ?? "Test",
        lastName: lastName ?? "Admin",
      },
    })
    .returning();

  console.log(`Seeded admin: ${admin.email} (${admin.office}, ${admin.role})`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
