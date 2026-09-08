import bcrypt from "bcryptjs";
import { db, client } from "../db";
import { admins } from "../../src/db/schema";

async function main() {
  const [email, password, officeArg, role, firstName, lastName] = process.argv.slice(2);

  if (!email || !password || !officeArg || !role) {
    console.error(
      "Usage: tsx scripts/seed-admin.ts <email> <password> <MEO|MDRRMO|-> <officer|supervisor|focal|system_admin> [firstName] [lastName]\n" +
        "  Use '-' for office when role is system_admin (system admins have no office).\n" +
        "  focal must always be seeded with office MDRRMO (organizationally MDRRMO/QRT)."
    );
    process.exit(1);
  }
  if (
    role !== "officer" &&
    role !== "supervisor" &&
    role !== "focal" &&
    role !== "system_admin"
  ) {
    console.error("role must be officer, supervisor, focal, or system_admin.");
    process.exit(1);
  }
  if (role === "system_admin" && officeArg !== "-") {
    console.error("system_admin must be seeded with office '-' (no office).");
    process.exit(1);
  }
  if (role === "focal" && officeArg !== "MDRRMO") {
    console.error("focal must be seeded with office MDRRMO.");
    process.exit(1);
  }
  if (
    (role === "officer" || role === "supervisor") &&
    officeArg !== "MEO" &&
    officeArg !== "MDRRMO"
  ) {
    console.error("office must be MEO or MDRRMO for officer/supervisor.");
    process.exit(1);
  }
  const office = officeArg === "-" ? null : (officeArg as "MEO" | "MDRRMO");

  const passwordHash = await bcrypt.hash(password, 10);

  // Upsert by email — idempotent, so re-running this (e.g. re-provisioning
  // a demo account right before a live run) updates the existing account
  // instead of failing on the unique constraint.
  const [admin] = await db
    .insert(admins)
    .values({
      email,
      passwordHash,
      office,
      role: role as "officer" | "supervisor" | "focal" | "system_admin",
      firstName: firstName ?? "Test",
      lastName: lastName ?? "Admin",
    })
    .onConflictDoUpdate({
      target: admins.email,
      set: {
        passwordHash,
        office,
        role: role as "officer" | "supervisor" | "focal" | "system_admin",
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
