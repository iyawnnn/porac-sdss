import { sql } from '../lib/seed-db';
import { seedDemoCitizens } from '../lib/seed-demo-citizens';
import { E2E_CITIZEN_ACCOUNT } from '../../../e2e/test-credentials';

void seedDemoCitizens(
  sql,
  process.env.SEED_USER_PASSWORD ?? E2E_CITIZEN_ACCOUNT.password,
)
  .then(() => console.log('Seeded five demo citizens.'))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Citizen seed failed.',
    );
    process.exitCode = 1;
  })
  .finally(() => sql.end());
