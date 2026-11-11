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
    const { code, signal } = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          // Node 24 V8 can abort while reclaiming repeated PGlite Wasm instances.
          // Scope the workaround to this child; keep every assertion enabled.
          // https://github.com/nodejs/node/issues/66366
          ...(file === 'migration-chain.pglite.cjs'
            ? ['--no-wasm-code-gc']
            : []),
          '--require',
          path.join(__dirname, 'helpers/migration-test-guard.cjs'),
          path.join(__dirname, file),
        ],
        { cwd: root, env, windowsHide: true, stdio: 'inherit' },
      );
      child.on('error', reject);
      child.on('exit', (code, signal) => resolve({ code, signal }));
    });
    assert(
      code === 0 && signal === null,
      `Migration harness failed: ${file} (exit code: ${code}, signal: ${signal ?? 'none'})`,
    );
  }
  console.log(files.length + ' migration harnesses passed');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
