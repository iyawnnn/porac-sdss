import bcrypt from 'bcryptjs';
import type { Sql } from 'postgres';

// Data only: the final migration schema has no citizens.verified column.
export async function seedDemoCitizens(pg: Sql, password: string) {
  const hash = await bcrypt.hash(password, 12);
  for (let i = 1; i <= 5; i++) {
    const email = 'citizen' + i + '@porac.ph';
    await pg`INSERT INTO citizens(first_name,last_name,email,password_hash)
      VALUES(${'Citizen ' + i},'Porac',${email},${hash})
      ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash`;
  }
}
