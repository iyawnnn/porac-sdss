import { InventoryError } from './test-data-inventory-options';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { readInventory } from './test-data-inventory';

function outside(repository: string, target: string) {
  const rel = relative(repository, target);
  if (
    !(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) ||
    target.startsWith('\\\\')
  )
    throw new InventoryError(
      'Inventory output must be local and outside the repository.',
    );
}

// No caller-controlled output filename, public folder or overwrite. The only
// persistent writes are these private review artifacts, never database records.
export function writeInventoryReport(
  report: Awaited<ReturnType<typeof readInventory>> & {
    target: string;
    gitCommit: string;
  },
  repository: string,
) {
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA
      : (process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'));
  if (!base || !isAbsolute(base))
    throw new InventoryError(
      'Inventory output requires a local application-data directory.',
    );
  // Resolve each existing ancestor before creating anything beneath it. An
  // existing junction must never redirect a report into the repo/public tree.
  const repo = realpathSync(repository);
  let root = resolve(base);
  while (!existsSync(root)) root = resolve(root, '..');
  outside(repo, realpathSync(root));
  const segments = relative(
    root,
    resolve(base, 'PORAC-SDSS', 'phase8c-inventory'),
  ).split(sep);
  for (const segment of segments) {
    root = join(root, segment);
    outside(repo, root);
    if (existsSync(root)) {
      if (lstatSync(root).isSymbolicLink())
        throw new InventoryError('Inventory output cannot be a link.');
      outside(repo, realpathSync(root));
    } else mkdirSync(root, { mode: 0o700 });
  }
  const folder = join(
    root,
    new Date().toISOString().replace(/[-:.]/g, '') + '-' + process.pid,
  );
  mkdirSync(folder, { mode: 0o700 });
  if (process.platform === 'win32') {
    const sid = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
      ],
      { encoding: 'utf8', windowsHide: true, stdio: 'pipe' },
    ).trim();
    if (!/^S-1-\d+(?:-\d+)+$/.test(sid))
      throw new InventoryError(
        'Inventory output cannot determine the owner SID.',
      );
    execFileSync(
      'icacls.exe',
      [folder, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`],
      { windowsHide: true, stdio: 'pipe' },
    );
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  if (Buffer.byteLength(json) > 25 * 1024 * 1024)
    throw new InventoryError(
      'Inventory output exceeds 25 MiB; no partial report was written.',
    );
  const summary =
    '# Test-data review inventory\n\nREAD ONLY. No record is approved for deletion.\n\n' +
    'Target: ' +
    report.target +
    '\n\nSnapshot: ' +
    report.snapshotAt +
    '\n\nCommit: ' +
    report.gitCommit +
    '\n\n' +
    'Candidate counts: ' +
    JSON.stringify(report.candidateCounts) +
    '\n\n' +
    'Mixed/context tickets: ' +
    report.mixedTicketIds.length +
    '; unresolved references: ' +
    report.unresolvedReferences.length +
    '.\n\n' +
    'See inventory.json for IDs, match reasons, dates, all selected references and limitations. Unknown references and dependencies are retained for owner review. This file is not an execution list.\n\n' +
    report.policy
      .concat(report.limitations)
      .map((line) => '- ' + line)
      .join('\n') +
    '\n';
  writeFileSync(join(folder, 'inventory.json'), json, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(join(folder, 'summary.md'), summary, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(
    join(folder, 'manifest.json'),
    JSON.stringify(
      {
        version: report.version,
        gitCommit: report.gitCommit,
        snapshotAt: report.snapshotAt,
        sha256: createHash('sha256').update(json).digest('hex'),
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return folder;
}
