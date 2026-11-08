import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { TransactionSql } from 'postgres';
import { ACK_CANONICAL_QUERY } from './acknowledgment-contraction';

export const ACK_ARCHIVE_VERSION = '0050.report-acknowledgments.v1';
export interface AcknowledgmentArchiveManifest {
  schemaVersion: typeof ACK_ARCHIVE_VERSION;
  rowCount: number;
  sha256: string;
  createdAt: string;
  gitCommit: string;
}
const columns = [
  'id',
  'report_id',
  'acknowledged_by_admin_id',
  'acknowledged_by_name',
  'remarks',
  'acknowledged_at',
].sort();

function validateRow(line: string): number {
  let row: Record<string, unknown>;
  try {
    row = JSON.parse(line) as Record<string, unknown>;
  } catch {
    throw new Error('Archive row is not valid JSON');
  }
  if (
    !row ||
    Array.isArray(row) ||
    Object.keys(row).sort().join() !== columns.join()
  )
    throw new Error('Archive row has unexpected columns');
  for (const key of ['id', 'report_id', 'acknowledged_by_admin_id']) {
    const value = row[key];
    if (key === 'acknowledged_by_admin_id' && value === null) continue;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < -2147483648 ||
      value > 2147483647
    )
      throw new Error('Archive row has an invalid integer');
  }
  for (const key of ['acknowledged_by_name', 'remarks']) {
    if (row[key] !== null && typeof row[key] !== 'string')
      throw new Error('Archive row has an invalid text field');
  }
  if (
    typeof row.acknowledged_at !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(row.acknowledged_at) ||
    !Number.isFinite(Date.parse(row.acknowledged_at))
  )
    throw new Error(
      'Archive requires a finite UTC ISO timestamp with microseconds',
    );
  return row.id as number;
}

export async function canonicalAcknowledgmentRows(tx: TransactionSql) {
  const rows = await tx.unsafe<{ id: number; canonical_row: string }[]>(
    `${ACK_CANONICAL_QUERY} ORDER BY id`,
  );
  for (const row of rows) validateRow(row.canonical_row);
  return rows.map((row) => row.canonical_row);
}

export function archiveDigest(lines: string[]) {
  const hash = createHash('sha256');
  for (const line of lines) hash.update(line + '\n', 'utf8');
  return { rowCount: lines.length, sha256: hash.digest('hex') };
}

export function assertArchiveOutsideRepository(path: string) {
  const root = resolve(__dirname, '../../..');
  const target = resolve(path);
  const rel = relative(root, target);
  const outside = rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);
  if (!outside || target.startsWith('\\\\'))
    throw new Error(
      'Archive must be on a local path outside the repository/web folders',
    );
}

export function readAcknowledgmentArchive(archivePath: string) {
  if (!isAbsolute(archivePath) || !archivePath.endsWith('.jsonl'))
    throw new Error('--archive requires an absolute JSONL archive path');
  assertArchiveOutsideRepository(archivePath);
  if (
    !lstatSync(archivePath).isFile() ||
    lstatSync(archivePath).isSymbolicLink()
  )
    throw new Error('Archive must be a regular file, not a link');
  assertArchiveOutsideRepository(realpathSync(archivePath));
  const manifestPath = archivePath + '.manifest.json';
  if (
    !lstatSync(manifestPath).isFile() ||
    lstatSync(manifestPath).isSymbolicLink() ||
    lstatSync(manifestPath).size > 65536
  )
    throw new Error('Archive manifest must be a small regular file');
  assertArchiveOutsideRepository(realpathSync(manifestPath));
  let manifest: AcknowledgmentArchiveManifest;
  try {
    manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as AcknowledgmentArchiveManifest;
  } catch {
    throw new Error('Archive manifest is not valid JSON');
  }
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.keys(manifest).sort().join() !==
      ['schemaVersion', 'rowCount', 'sha256', 'createdAt', 'gitCommit']
        .sort()
        .join() ||
    manifest.schemaVersion !== ACK_ARCHIVE_VERSION ||
    !Number.isSafeInteger(manifest.rowCount) ||
    manifest.rowCount < 0 ||
    typeof manifest.sha256 !== 'string' ||
    typeof manifest.gitCommit !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(manifest.gitCommit) ||
    typeof manifest.createdAt !== 'string' ||
    !manifest.createdAt.endsWith('Z') ||
    !Number.isFinite(Date.parse(manifest.createdAt))
  )
    throw new Error(
      'Archive manifest is invalid or has an unsupported schema version',
    );
  const bytes = readFileSync(archivePath);
  if (bytes.length && bytes[bytes.length - 1] !== 10)
    throw new Error('Canonical archive must end with LF');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes))
    throw new Error('Archive is not valid UTF-8');
  const lines = text ? text.slice(0, -1).split('\n') : [];
  let previous: number | undefined;
  for (const line of lines) {
    const id = validateRow(line);
    if (previous !== undefined && id <= previous)
      throw new Error('Archive rows must be in strict id order');
    previous = id;
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (lines.length !== manifest.rowCount || sha256 !== manifest.sha256)
    throw new Error('Archive file does not match its manifest count/checksum');
  return manifest;
}

// The CLI creates a new private directory first. Tests exercise this codec
// with isolated fixtures; they never invoke the maintenance CLI or a real DB.
export function writeAcknowledgmentArchive(
  archivePath: string,
  lines: string[],
  metadata: { createdAt: string; gitCommit: string },
) {
  assertArchiveOutsideRepository(archivePath);
  for (const line of lines) validateRow(line);
  const manifest: AcknowledgmentArchiveManifest = {
    schemaVersion: ACK_ARCHIVE_VERSION,
    ...archiveDigest(lines),
    ...metadata,
  };
  const partial = archivePath + '.partial';
  const manifestPath = archivePath + '.manifest.json';
  try {
    writeFileSync(partial, lines.length ? lines.join('\n') + '\n' : '', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    writeFileSync(
      manifestPath + '.partial',
      JSON.stringify(manifest, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    renameSync(partial, archivePath);
    renameSync(manifestPath + '.partial', manifestPath);
  } catch (error) {
    for (const file of [partial, manifestPath + '.partial']) {
      try {
        unlinkSync(file);
      } catch {
        /* Keep any completed archive for recovery. */
      }
    }
    throw error;
  }
  return manifest;
}
