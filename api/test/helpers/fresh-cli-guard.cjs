// Preload for fresh-check seed children. Never load an env file or permit a
// connection except to the owning in-memory database's exact loopback port.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { fileURLToPath } = require('node:url');
const root = fs.realpathSync(process.env.PORAC_FRESH_ROOT);
const port = Number(process.env.PORAC_FRESH_PORT);
const auditPath = path.resolve(process.env.PORAC_FRESH_AUDIT);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  [3000, 3001].includes(port) ||
  !auditPath.startsWith(root + path.sep)
) {
  throw Error('Invalid fresh-check boundary');
}
const state = {
  networkAttempts: 0,
  envReadAttempts: 0,
  outsideWrites: 0,
  ipcSuppressed: 0,
};
const originalWrite = fs.writeFileSync.bind(fs);
const exists = fs.existsSync.bind(fs);
const realpath = fs.realpathSync.bind(fs);
function filename(value) {
  if (typeof value === 'number') return null;
  return path.resolve(
    value instanceof URL ? fileURLToPath(value) : String(value),
  );
}
function checkFile(value) {
  const name = filename(value);
  if (name && /^\.env(?:\.|$)/i.test(path.basename(name))) {
    state.envReadAttempts++;
    throw Error('Fresh check blocked env-file access');
  }
  return name;
}
function checkWrite(value) {
  const name = checkFile(value);
  if (!name) return;
  let ancestor = name;
  const tail = [];
  while (!exists(ancestor)) {
    tail.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const physical = path.resolve(realpath(ancestor), ...tail);
  if (physical !== root && !physical.startsWith(root + path.sep)) {
    state.outsideWrites++;
    throw Error('Fresh check blocked a write outside its temporary folder');
  }
}
for (const key of ['readFile', 'readFileSync', 'createReadStream']) {
  const original = fs[key];
  fs[key] = function (file, ...args) {
    checkFile(file);
    return original.call(this, file, ...args);
  };
}
const originalRead = fs.promises.readFile;
fs.promises.readFile = function (file, ...args) {
  try {
    checkFile(file);
  } catch (error) {
    return Promise.reject(error);
  }
  return originalRead.call(this, file, ...args);
};
for (const key of [
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
  'mkdir',
  'mkdirSync',
  'unlink',
  'unlinkSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'truncate',
  'truncateSync',
]) {
  const original = fs[key];
  fs[key] = function (file, ...args) {
    checkWrite(file);
    return original.call(this, file, ...args);
  };
}
for (const key of [
  'writeFile',
  'appendFile',
  'mkdir',
  'unlink',
  'rm',
  'rmdir',
  'truncate',
]) {
  const original = fs.promises[key];
  fs.promises[key] = function (file, ...args) {
    try {
      checkWrite(file);
    } catch (error) {
      return Promise.reject(error);
    }
    return original.call(this, file, ...args);
  };
}
for (const key of ['open', 'openSync']) {
  const original = fs[key];
  fs[key] = function (file, flags, ...args) {
    checkFile(file);
    const writes =
      typeof flags === 'number'
        ? flags &
          (fs.constants.O_WRONLY |
            fs.constants.O_RDWR |
            fs.constants.O_CREAT |
            fs.constants.O_TRUNC |
            fs.constants.O_APPEND)
        : /[wa+]/.test(flags ?? 'r');
    if (writes) checkWrite(file);
    return original.call(this, file, flags, ...args);
  };
}
for (const key of ['rename', 'renameSync']) {
  const original = fs[key];
  fs[key] = function (from, to, ...args) {
    checkWrite(from);
    checkWrite(to);
    return original.call(this, from, to, ...args);
  };
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    typeof first === 'object' && first !== null
      ? first
      : { port: first, host: args[1] };
  // tsx probes its optional parent watcher pipe. Suppress that IPC locally;
  // never connect it, and keep it separate from attempted network egress.
  if (options.path || (typeof first === 'string' && !/^\d+$/.test(first))) {
    state.ipcSuppressed++;
    queueMicrotask(() =>
      this.emit(
        'error',
        Object.assign(Error('Fresh-check watcher IPC disabled'), {
          code: 'ENOENT',
        }),
      ),
    );
    return this;
  }
  if (
    options.host !== '127.0.0.1' ||
    Number(options.port) !== port ||
    options.path
  ) {
    state.networkAttempts++;
    throw Error('Fresh check blocked a non-test connection');
  }
  return connect.apply(this, args);
};
globalThis.fetch = () => {
  state.networkAttempts++;
  return Promise.reject(Error('Fresh check blocked a network fetch'));
};
process.on('exit', () => originalWrite(auditPath, JSON.stringify(state)));
