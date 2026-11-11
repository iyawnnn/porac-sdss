// One sequential entry point. Never invoke a live migrate:* package command.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = {};
for (const key of [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'LANG',
  'PGLITE_MODULE_ROOT',
  'NODE_PATH',
])
  if (process.env[key] !== undefined) env[key] = process.env[key];
assert(
  env.PGLITE_MODULE_ROOT,
  'Set PGLITE_MODULE_ROOT to the external pinned PGlite install',
);
const files = [
  'migration-chain.pglite.cjs',
  'assessment-alignment.pglite.cjs',
  'phase8b-contraction.pglite.cjs',
  'ticket-acknowledgments-contraction.pglite.cjs',
  'audit-append-only.pglite.cjs',
];
(async () => {
  for (const file of files) {
    console.log('Migration harness: ' + file);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--require',
          path.join(__dirname, 'helpers/migration-test-guard.cjs'),
          path.join(__dirname, file),
        ],
        { cwd: root, env, windowsHide: true, stdio: 'inherit' },
      );
      child.on('error', reject);
      child.on('exit', resolve);
    });
    assert.equal(code, 0, 'Migration harness failed: ' + file);
  }
  console.log(files.length + ' migration harnesses passed');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
