import bcrypt from 'bcryptjs';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { admins } from '../../src/db/schema';
import {
  assertAccountFields,
  roleMirror,
} from '../../src/common/authz/admin-account-fields';
import { seedArguments } from './seed-target';

export function parseSeedAdminArguments(args: readonly string[]) {
  const [
    email,
    password,
    accountType,
    officeArg,
    focalArg,
    firstName,
    lastName,
    ...extra
  ] = seedArguments(args);
  if (
    !email ||
    !password ||
    !accountType ||
    !officeArg ||
    !focalArg ||
    extra.length
  ) {
    throw new Error(
      'Usage: seed:admin -- <email> <password> <PERSONNEL|SYSTEM_ADMIN> <MEO|MDRRMO|-> <true|false> [firstName] [lastName]',
    );
  }
  if (focalArg !== 'true' && focalArg !== 'false') {
    throw new Error('is_focal must be true or false.');
  }
  const fields = assertAccountFields(
    accountType,
    focalArg === 'true',
    officeArg === '-' ? null : officeArg,
  );
  return {
    email,
    password,
    firstName: firstName ?? 'Test',
    lastName: lastName ?? 'Admin',
    ...fields,
  };
}

// Existing seed upsert, separated for a migration-built in-memory check.
export async function seedAdminAccount(
  db: PostgresJsDatabase,
  args: readonly string[],
) {
  const { password, ...account } = parseSeedAdminArguments(args);
  const values = {
    ...account,
    passwordHash: await bcrypt.hash(password, 10),
    role: roleMirror(account),
  };
  const [admin] = await db
    .insert(admins)
    .values(values)
    .onConflictDoUpdate({
      target: admins.email,
      set: values,
    })
    .returning({
      email: admins.email,
      office: admins.office,
      accountType: admins.accountType,
      isFocal: admins.isFocal,
    });
  return admin;
}
