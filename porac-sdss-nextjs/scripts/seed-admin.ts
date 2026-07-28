import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { admins } from "../lib/db/schema";
import { client } from "../lib/db";

async function main() {
  const [email, password, office, role, firstName, lastName] = process.argv.slice(2);

  if (!email || !password || !office || !role) {
    console.error(
      "Usage: tsx scripts/seed-admin.ts <email> <password> <MEO|MDRRMO> <officer|supervisor> [firstName] [lastName]"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

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
    .returning();

  console.log(`Created admin: ${admin.email} (${admin.office}, ${admin.role})`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
