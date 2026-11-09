import { db, client } from '../lib/seed-db';
import { seedAdminAccount } from '../lib/seed-admin-account';

async function main() {
  try {
    const admin = await seedAdminAccount(db, process.argv.slice(2));
    console.log(
      'Seeded admin: ' +
        admin.email +
        ' (' +
        (admin.office ?? 'no office') +
        ', ' +
        admin.accountType +
        (admin.isFocal ? ', Focal' : '') +
        ')',
    );
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin seed failed.');
  process.exitCode = 1;
});
