import { sql } from './db';
import {
  OperationalPriorityService,
  priorityIndexFor,
  type PriorityInputRow,
} from '../src/domain/operational-priority.service';
import {
  type CitizenSeverity,
  severityFactor,
  severityLabelForFactor,
  ticketSeverity,
} from '../src/common/utils/severity';
import { computePriorityIndex } from '../src/common/utils/scoring';

// Manuscript revision Phase 4, step 4a (manuscript pp. 73–74): one-off
// recalculation of every active, not merged-away ticket's Operational
// Priority with the median severity rule, so the change shows at once
// rather than on the next admin read or daily cron.
//
//   pnpm --prefix api recalc:median-severity            dry run, writes nothing
//   pnpm --prefix api recalc:median-severity --apply    writes priority_index
//
// The ticket severity itself is not stored anywhere (it is derived from the
// reports when needed), so priority_index is the only column written, and
// only where its value changes. updated_at is left alone (it is the citizen's
// "last update"), and no audit event is written: this is a recalculation,
// not a staff action, so the record is the summary line printed at the end.
// Resolved/Rejected tickets keep their last value, as the app does.
//
// Running it twice changes nothing the second time, except where ticket age
// moved a value across a rounding step in between, which the app's own
// recalculation on every admin read does too.
//
// Run it after the API with the median rule is deployed: the old API would
// put the old MAX values back on its next recalculation.

// The rule this step replaced, for the before/after report only.
function oldMaxLabel(severities: string[]): CitizenSeverity {
  if (severities.length === 0) return 'Low';
  return severityLabelForFactor(Math.max(...severities.map(severityFactor)));
}

interface Planned {
  row: PriorityInputRow;
  oldLabel: CitizenSeverity;
  newLabel: CitizenSeverity;
  newFactor: number;
  oldMaxPriority: number;
  newPriority: number;
}

function plan(rows: PriorityInputRow[], now: Date): Planned[] {
  return rows.map((row) => {
    const median = ticketSeverity(row.member_severities);
    const oldLabel = oldMaxLabel(row.member_severities);
    return {
      row,
      oldLabel,
      newLabel: median.label,
      newFactor: median.factor,
      oldMaxPriority: computePriorityIndex({
        severity: oldLabel,
        createdAt: row.created_at,
        activeBarangayCount: row.active_barangay_count,
        maxActiveBarangayCount: row.max_active_barangay_count,
        now,
      }),
      newPriority: priorityIndexFor(row, now),
    };
  });
}

function report(planned: Planned[]) {
  const severityChanged = planned.filter(
    (p) =>
      p.oldLabel !== p.newLabel || severityFactor(p.oldLabel) !== p.newFactor,
  );
  const toWrite = planned.filter((p) => p.row.priority_index !== p.newPriority);

  console.log(`Active, not merged-away tickets: ${planned.length}`);
  console.log(
    `Severity changes (old MAX -> new median): ${severityChanged.length} ticket(s)`,
  );
  const breakdown = new Map<string, number>();
  for (const p of severityChanged) {
    const key = `${p.oldLabel} -> ${p.newLabel} (${p.newFactor})`;
    breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...breakdown].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  const fromSeverity = toWrite.filter(
    (p) => p.oldMaxPriority !== p.newPriority,
  );
  console.log(
    `priority_index to change: ${toWrite.length} ticket(s) (${fromSeverity.length} because of the median, ${toWrite.length - fromSeverity.length} only from age since the last recalculation)`,
  );
  const largest = [...toWrite]
    .sort(
      (a, b) =>
        Math.abs(b.newPriority - (b.row.priority_index ?? 0)) -
          Math.abs(a.newPriority - (a.row.priority_index ?? 0)) ||
        a.row.id - b.row.id,
    )
    .slice(0, 10);
  if (largest.length > 0) {
    console.log('Largest priority changes (stored -> new):');
    for (const p of largest) {
      console.log(
        `  Ticket #${p.row.id}: ${p.row.priority_index ?? 'none'} -> ${p.newPriority} (severity ${p.oldLabel} -> ${p.newLabel} ${p.newFactor}, ${p.row.member_severities.length} report(s): ${p.row.member_severities.join(', ')})`,
      );
    }
  }
  return toWrite;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const now = new Date();
  const service = new OperationalPriorityService(sql);

  const planned = plan(await service.readInputs(sql, null), now);
  const toWrite = report(planned);

  if (!apply) {
    console.log('Dry run: nothing was written. Add --apply to write.');
    await sql.end();
    return;
  }

  // Same filter as the read, so a ticket that closed or was merged away in
  // between is left alone; IS DISTINCT FROM makes an unchanged value a no-op.
  const ids = toWrite.map((p) => p.row.id);
  const values = toWrite.map((p) => p.newPriority);
  const updated = await sql.begin(async (tx) => {
    const rows = await tx<{ id: number }[]>`
      UPDATE tickets AS t SET priority_index = u.priority_index
      FROM unnest(${ids}::int[], ${values}::int[]) AS u(id, priority_index)
      WHERE t.id = u.id
        AND t.status IN ('Reported', 'Under Review', 'In Progress')
        AND t.merged_into_ticket_id IS NULL
        AND t.priority_index IS DISTINCT FROM u.priority_index
      RETURNING t.id
    `;
    return rows.length;
  });
  console.log(
    `Applied at ${now.toISOString()}: median severity recalculation wrote priority_index on ${updated} of ${planned.length} active ticket(s); no other column, no audit event.`,
  );
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
