import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Sql } from 'postgres';
import {
  acknowledgmentState,
  migrationError,
  verifyAcknowledgmentDefinitions,
} from '../lib/acknowledgment-contraction';
import {
  assertArchiveOutsideRepository,
  canonicalAcknowledgmentRows,
  writeAcknowledgmentArchive,
} from '../lib/acknowledgment-archive';

async function main() {
  if (process.argv.length !== 2)
    throw new Error('This archive command takes no arguments');
  const root = resolve(__dirname, '../../..');
  const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA
      : join(homedir(), '.local/share');
  if (!base) throw new Error('LOCALAPPDATA is required');
  const backupRoot = join(base, 'PORAC-SDSS', 'phase8b-backups');
  assertArchiveOutsideRepository(backupRoot);
  const { sql } = (await import('../db.js')) as { sql: Sql };
  try {
    await sql.begin('isolation level repeatable read read only', async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '60s'");
      await tx.unsafe('SET LOCAL search_path = pg_catalog, public');
      if (!(await acknowledgmentState(tx)).legacy)
        throw new Error(
          'report_acknowledgments is already gone; no archive was written',
        );
      await verifyAcknowledgmentDefinitions(tx);
      const lines = await canonicalAcknowledgmentRows(tx);
      const createdAt = new Date().toISOString();
      mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
      assertArchiveOutsideRepository(realpathSync(backupRoot));
      const directory = join(backupRoot, createdAt.replace(/[-:.]/g, ''));
      mkdirSync(directory, { mode: 0o700 });
      if (process.platform === 'win32') {
        const sid = execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim();
        if (!/^S-1-\d+(?:-\d+)+$/.test(sid))
          throw new Error('Cannot determine owner SID for private archive');
        execFileSync(
          'icacls.exe',
          [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`],
          { windowsHide: true, stdio: 'pipe' },
        );
      }
      const archivePath = join(directory, 'report-acknowledgments.jsonl');
      const manifest = writeAcknowledgmentArchive(archivePath, lines, {
        createdAt,
        gitCommit,
      });
      console.log(
        JSON.stringify({
          archivePath,
          rowCount: manifest.rowCount,
          sha256: manifest.sha256,
        }),
      );
    });
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(migrationError(error));
    process.exitCode = 1;
  });
}
