const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function copySources(source, destination) {
  const reject = (name) =>
    /^\.env(?:\.|$)/i.test(name) ||
    [
      'node_modules',
      '.git',
      '.agents',
      '.worktrees',
      '.pnpm-store',
      'package-lock.json',
      'next-env.d.ts',
      'pnpm-workspace.yaml',
    ].includes(name);
  function copy(from, to) {
    const info = fs.lstatSync(from);
    assert(!info.isSymbolicLink(), 'Unexpected link in seed source');
    if (info.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from))
        if (!reject(name)) copy(path.join(from, name), path.join(to, name));
    } else fs.copyFileSync(from, to);
  }
  for (const name of [
    'api/src',
    'api/scripts',
    'api/drizzle',
    'lib',
    'types',
  ]) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) copy(from, path.join(destination, name));
  }
  for (const name of [
    'api/package.json',
    'api/tsconfig.json',
    'api/tsconfig.build.json',
    'package.json',
    'tsconfig.json',
    'e2e/test-credentials.ts',
    'public/assets/gis/porac_barangays.json',
    'public/assets/gis/porac_osm_boundary.json',
  ]) {
    const to = path.join(destination, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(source, name), to);
  }
  fs.symlinkSync(
    path.join(source, 'api/node_modules'),
    path.join(destination, 'api/node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert(!fs.existsSync(path.join(destination, 'api/.env')));
  assert(!fs.existsSync(path.join(destination, 'node_modules')));
}

function commandCatalog(root) {
  const scripts = JSON.parse(
    fs.readFileSync(path.join(root, 'api/package.json'), 'utf8'),
  ).scripts;
  const commands = Object.fromEntries(
    Object.entries(scripts).flatMap(([name, command]) => {
      const match =
        /^tsx --env-file=\.env (scripts\/seed\/[\w-]+\.ts)(?: (.*))?$/.exec(
          command,
        );
      return match
        ? [[name, { entry: match[1], args: match[2]?.split(' ') ?? [] }]]
        : [];
    }),
  );
  assert.equal(
    Object.keys(commands).length,
    14,
    'Review coverage when seed commands change',
  );
  const files = fs
    .readdirSync(path.join(root, 'api/scripts/seed'))
    .filter((f) => f.endsWith('.ts'))
    .sort();
  assert.deepEqual(
    [
      ...new Set(Object.values(commands).map((c) => path.basename(c.entry))),
    ].sort(),
    files,
    'Every seed entrypoint must have command coverage',
  );
  return commands;
}

const FRESH_STAFF_PASSWORD = 'fresh-only-e2e-staff-password';

class SeedRunner {
  constructor(source, root, output, secrets) {
    this.source = source;
    this.boundaryRoot = path.dirname(source);
    assert(path.resolve(output).startsWith(this.boundaryRoot + path.sep));
    this.root = root;
    this.output = output;
    this.secrets = secrets;
    this.commands = commandCatalog(source);
    this.covered = new Set();
    this.serial = 0;
    fs.mkdirSync(output, { recursive: true });
    this.preload = path.join(output, 'guard.cjs');
    fs.copyFileSync(path.join(__dirname, 'fresh-cli-guard.cjs'), this.preload);
    this.cache = path.join(output, 'tmp');
    fs.mkdirSync(this.cache, { recursive: true });
  }
  environment(port, audit, databaseUrl) {
    // No inherited DATABASE_URL, PG*, mail/cloud credentials or NODE_OPTIONS.
    const env = {};
    for (const name of [
      'PATH',
      'Path',
      'PATHEXT',
      'SystemRoot',
      'WINDIR',
      'COMSPEC',
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'APPDATA',
      'LANG',
    ])
      if (process.env[name] !== undefined) env[name] = process.env[name];
    return {
      ...env,
      TEMP: this.cache,
      TMP: this.cache,
      TMPDIR: this.cache,
      DATABASE_URL: databaseUrl,
      // seed:e2e-admins has no committed staff password (IAN-26).
      E2E_ADMIN_PASSWORD: FRESH_STAFF_PASSWORD,
      PGMAX: '1',
      NODE_ENV: 'test',
      TSX_TSCONFIG_PATH: path.join(this.source, 'api/tsconfig.json'),
      NODE_PATH: path.join(this.root, 'api/node_modules'),
      TARGET_DEM_TIFF_FILE: 'test-fixtures/dem-small.tif',
      RAINFALL_LOOKUPS: 'disabled',
      HAZARD_INFORMATION_LOOKUPS: 'disabled',
      PORAC_FRESH_ROOT: this.boundaryRoot,
      PORAC_FRESH_PORT: String(port),
      PORAC_FRESH_AUDIT: audit,
    };
  }
  scrub(text) {
    let result = text.replace(
      /postgres(?:ql)?:\/\/[^\s'")]+/gi,
      '[connection redacted]',
    );
    for (const secret of this.secrets)
      if (secret) result = result.split(secret).join('[test secret redacted]');
    return result;
  }
  async execute(
    label,
    port,
    databaseUrl,
    args,
    expected,
    boundary = { networkAttempts: 0, envReadAttempts: 0, outsideWrites: 0 },
  ) {
    const stem =
      String(++this.serial).padStart(3, '0') +
      '-' +
      label.replace(/[^\w-]/g, '-');
    const audit = path.join(this.output, stem + '.boundary.json');
    const env = this.environment(port, audit, databaseUrl);
    const allArgs = ['--require', this.preload, ...args];
    assert(
      !allArgs.some((a) => a.includes('--env-file')),
      'Fresh test must never load an env file',
    );
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, allArgs, {
        cwd: path.join(this.source, 'api'),
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(Error('Seed timed out: ' + label));
      }, 90_000);
      child.stdout.on('data', (part) => {
        stdout += part;
      });
      child.stderr.on('data', (part) => {
        stderr += part;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
    fs.writeFileSync(
      path.join(this.output, stem + '.log'),
      this.scrub(result.stdout + '\n' + result.stderr),
    );
    assert.equal(
      result.code,
      expected,
      label + ': unexpected exit; ' + this.scrub(result.stderr).slice(-1800),
    );
    assert(fs.existsSync(audit), label + ': safety preload did not run');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(audit, 'utf8')),
      {
        ...boundary,
        ipcSuppressed: args.includes(require.resolve('tsx/cjs')) ? 1 : 0,
      },
      label + ': crossed a fresh-check boundary',
    );
    return result;
  }
  async run(name, connection, extra = [], expected = 0) {
    const command = this.commands[name];
    assert(command, 'Unknown seed command');
    this.covered.add(name);
    return this.execute(
      name,
      connection.port,
      connection.url,
      [
        '--require',
        require.resolve('tsx/cjs'),
        path.join(this.source, 'api', command.entry),
        ...command.args,
        ...extra,
      ],
      expected,
    );
  }
}
module.exports = {
  copySources,
  commandCatalog,
  SeedRunner,
  FRESH_STAFF_PASSWORD,
};
