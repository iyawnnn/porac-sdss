import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from './db/db.module';

@Injectable()
export class AppService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  async health() {
    const [row] = await this.pg<{ now: Date }[]>`SELECT NOW()`;
    return { status: 'ok', dbTime: row.now };
  }
}
