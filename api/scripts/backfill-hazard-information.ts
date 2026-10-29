import type { ConfigService } from '@nestjs/config';
import { sql } from './db';
import type { Env } from '../src/config/env';
import {
  HazardInformationService,
  type HazardLookupOutcome,
} from '../src/domain/hazard-information.service';
import {
  HAZARD_APPLICABLE_CATEGORIES,
  HAZARD_LAYERS,
  hazardContextForCategory,
} from '../src/common/utils/hazard-information';

// Manuscript revision Phase 4, step 4b (manuscript pp. 71-72): one-off
// DENR-MGB Hazard Information lookups for the active tickets that existed
// before the feature, so they don't wait for someone to open them.
//
//   pnpm --prefix api backfill:hazard-information                    dry run
//   pnpm --prefix api backfill:hazard-information --apply            look up all
//   pnpm --prefix api backfill:hazard-information --apply --limit 20 the first 20
//
// The dry run makes no network call and writes nothing: it counts the
// active, not merged-away tickets in a category with a lookup (Localized
// Flooding, Rain-Induced Slope Failure/Landslide and their legacy names) that
// have no current result for their present category and location.
//
// --apply looks them up one at a time, oldest ticket first, about 500 ms
// apart, through HazardInformationService.lookup (the same code the API
// runs: same layers, 8 s timeout, single attempt, supersede + insert in one
// transaction). A failure is stored as TEMPORARILY_UNAVAILABLE, which Ticket
// Detail's auto-retry picks up after 10 minutes. Tickets that already have a
// current result are skipped, so running it again only picks up what is
// still missing. Closed tickets are never looked up (they keep what they
// have), and Lahar and other categories never get a row.

const PAUSE_MS = 500;

const FLOOD_CATEGORIES = HAZARD_APPLICABLE_CATEGORIES.filter(
  (c) => hazardContextForCategory(c).contextType === 'FLOOD',
);

interface Candidate {
  id: number;
  category: string;
  has_current: boolean;
}

function parseLimit(argv: string[]): number | null {
  const i = argv.indexOf('--limit');
  if (i === -1) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('--limit needs a positive whole number, e.g. --limit 20');
  }
  return n;
}

function outcomeKey(outcome: HazardLookupOutcome): string {
  if (outcome.outcome === 'recorded') return outcome.lookupStatus;
  if (outcome.outcome === 'skipped') return `skipped (${outcome.reason})`;
  return 'not applicable';
}

async function candidates(): Promise<Candidate[]> {
  // "Current" here is what Ticket Detail shows as current: the row for the
  // category's context type at the ticket's present location.
  return sql<Candidate[]>`
    SELECT t.id, t.category,
      EXISTS (
        SELECT 1 FROM hazard_information h
        WHERE h.ticket_id = t.id AND h.superseded_at IS NULL
          AND ST_Equals(h.query_geom, t.geom)
          AND h.hazard_context_type = (
            CASE WHEN t.category = ANY(${FLOOD_CATEGORIES}::text[])
              THEN 'FLOOD' ELSE 'RAIN_INDUCED_LANDSLIDE' END
          )::hazard_context_type
      ) AS has_current
    FROM tickets t
    WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
      AND t.merged_into_ticket_id IS NULL
      AND t.category = ANY(${HAZARD_APPLICABLE_CATEGORIES}::text[])
    ORDER BY t.created_at, t.id
  `;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limit = parseLimit(process.argv);
  if (apply && process.env.HAZARD_INFORMATION_LOOKUPS === 'disabled') {
    throw new Error(
      'HAZARD_INFORMATION_LOOKUPS=disabled: lookups are switched off, nothing to apply.',
    );
  }

  const all = await candidates();
  const missing = all.filter((c) => !c.has_current);
  const byCategory = new Map<string, number>();
  for (const c of missing) {
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
  }

  console.log(
    apply
      ? 'APPLY: looking tickets up.'
      : 'DRY RUN: no network call, nothing written.',
  );
  console.log(
    `Active, not merged-away tickets in a category with a lookup: ${all.length}`,
  );
  console.log(
    `  already have a current result (skipped): ${all.length - missing.length}`,
  );
  console.log(`  without one: ${missing.length}`);
  for (const [category, n] of [...byCategory].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const layer =
      HAZARD_LAYERS[hazardContextForCategory(category).contextType!];
    console.log(`    ${category}: ${n} (${layer.sourceName})`);
  }
  const todo = limit === null ? missing : missing.slice(0, limit);
  if (limit !== null) {
    console.log(
      `--limit ${limit}: ${todo.length} ticket(s) would be looked up this run.`,
    );
  }

  if (!apply) {
    console.log(
      'Run with --apply to look them up (about 500 ms apart, up to 8 s each).',
    );
    await sql.end();
    return;
  }

  const config = {
    get: () => 'enabled',
  } as unknown as ConfigService<Env, true>;
  const service = new HazardInformationService(sql, config);
  const counts = new Map<string, number>();
  for (const [i, c] of todo.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    const outcome = await service.lookup(c.id);
    const key = outcomeKey(outcome);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    console.log(`  Ticket #${c.id} (${c.category}): ${key}`);
  }
  console.log(`Done: ${todo.length} ticket(s) looked up.`);
  for (const [key, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${key}: ${n}`);
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await sql.end();
  process.exit(1);
});
