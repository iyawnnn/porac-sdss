import type { Sql } from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  ACCOUNT_HOURLY_LIMIT,
  IP_HOURLY_BACKSTOP,
} from '../../src/domain/ratelimit.service';
import { renderExifImage } from '../../../lib/utils/generate-exif-image';
import { demoServices, DemoMediaService } from './demo-services';
import {
  DEMO_IP,
  demoPoint,
  loadDemoActors,
  requireDemo,
  requireEmptyDemoTarget,
} from './demo-workflow';
import { seedArguments } from './seed-target';

export function parseBulkOptions(args: readonly string[]) {
  const fields = seedArguments(args);
  let append = false,
    count = 3;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i] === '--append') append = true;
    else if (fields[i] === '--count' && /^\d+$/.test(fields[i + 1] ?? ''))
      count = Number(fields[++i]);
    else
      throw new Error('Usage: seed:bulk-reports -- [--count 1..15] [--append]');
  }
  requireDemo(
    Number.isInteger(count) && count >= 1 && count <= 15,
    'Bulk count must be 1..15.',
  );
  return { append, count };
}

export async function runBulkDemo(
  pg: Sql,
  db: PostgresJsDatabase,
  media: DemoMediaService,
  options: { append: boolean; count: number },
) {
  requireDemo(
    Number.isInteger(options.count) &&
      options.count >= 1 &&
      options.count <= 15,
    'Bulk count must be 1..15.',
  );
  if (!options.append) await requireEmptyDemoTarget(pg);
  const [previous] = await pg<
    { exists: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM reports WHERE title LIKE 'Phase 8c bulk report %')`;
  requireDemo(
    !previous.exists,
    'Bulk refused: this volume batch already exists; no reports were replaced or deleted.',
  );
  const { citizens } = await loadDemoActors(pg);
  const counts = await pg<
    { citizen_id: number; used: number }[]
  >`SELECT citizen_id,count(*)::int used FROM rate_limit_events
    WHERE citizen_id=ANY(${citizens.map((c) => c.citizenId)}::int[]) AND created_at>now()-interval '1 hour' GROUP BY citizen_id`;
  const [ip] = await pg<
    { used: number }[]
  >`SELECT count(*)::int used FROM rate_limit_events WHERE ip=${DEMO_IP} AND created_at>now()-interval '1 hour'`;
  const owners = citizens.flatMap((c) =>
    Array.from(
      {
        length: Math.max(
          0,
          ACCOUNT_HOURLY_LIMIT -
            (counts.find((r) => r.citizen_id === c.citizenId)?.used ?? 0),
        ),
      },
      () => c,
    ),
  );
  requireDemo(
    IP_HOURLY_BACKSTOP - ip.used >= options.count &&
      owners.length >= options.count,
    'Bulk refused: insufficient current account/IP submission capacity. Wait for the hourly window.',
  );
  const svc = demoServices(pg, db, media);
  const points: Awaited<ReturnType<typeof demoPoint>>[] = [];
  for (let i = 0; i < options.count; i++) {
    const point = await demoPoint(pg, 2300 + i * 100);
    requireDemo(
      await svc.barangays.findBarangayForPoint(point.lat, point.lng),
      'Bulk point is outside the reference geometry.',
    );
    const limit = await svc.rateLimit.checkRateLimit(
      owners[i].citizenId,
      DEMO_IP,
      point.lat,
      point.lng,
    );
    requireDemo(
      limit.allowed,
      limit.reason ?? 'Bulk rate-limit preflight refused.',
    );
    points.push(point);
  }
  // The submission service checks and records the real limits again per report.
  // A concurrent writer may consume capacity after preflight; partial work stays
  // visible and is never reset. A repeat refuses this batch's marker titles.
  const submissions: Awaited<ReturnType<typeof svc.reports.submit>>[] = [];
  for (const [i, point] of points.entries()) {
    const image = await renderExifImage({ ...point, variant: 2000 + i });
    submissions.push(
      await svc.reports.submit(
        owners[i],
        DEMO_IP,
        {
          ...point,
          title: 'Phase 8c bulk report ' + (i + 1),
          description: 'Optional volume through the real submission path.',
          category: 'Pothole / Road Surface Damage',
          citizenSeverity: 'Low',
        },
        image,
      ),
    );
  }
  return submissions;
}
