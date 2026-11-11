// Preload only for in-memory migration tests and their standalone CLI children.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const allowed = new Set();
const listeners = new WeakMap();
if (process.env.PORAC_MIGRATION_PORT) {
  const port = Number(process.env.PORAC_MIGRATION_PORT);
  assert(Number.isInteger(port) && port > 1023 && ![3000, 3001].includes(port));
  allowed.add(port);
}
function check(file) {
  if (typeof file === 'number') return;
  assert(
    !/^\.env(?:\.|$)/i.test(path.basename(String(file))),
    'Migration test blocked env-file access',
  );
}
for (const key of ['readFileSync', 'readFile', 'createReadStream']) {
  const original = fs[key];
  fs[key] = function (file, ...args) {
    check(file);
    return original.call(this, file, ...args);
  };
}
const read = fs.promises.readFile;
fs.promises.readFile = async function (file, ...args) {
  check(file);
  return read.call(this, file, ...args);
};
process.loadEnvFile = () => {
  throw Error('Migration test blocked loadEnvFile');
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  const options =
    typeof first === 'object' ? first : { port: first, host: args[1] };
  assert(
    options.port === 0 && options.host === '127.0.0.1',
    'Migration tests may bind only ephemeral loopback listeners',
  );
  return listen.apply(this, args);
};
const emit = net.Server.prototype.emit;
net.Server.prototype.emit = function (event, ...args) {
  if (event === 'listening') {
    listeners.set(this, this.address().port);
    allowed.add(this.address().port);
  }
  if (event === 'close') allowed.delete(listeners.get(this));
  return emit.call(this, event, ...args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    typeof first === 'object' ? first : { port: first, host: args[1] };
  // tsx's optional watcher pipe is never connected.
  if (options.path || (typeof first === 'string' && !/^\d+$/.test(first))) {
    queueMicrotask(() =>
      this.emit(
        'error',
        Object.assign(Error('Migration watcher disabled'), { code: 'ENOENT' }),
      ),
    );
    return this;
  }
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(options.host) &&
      allowed.has(Number(options.port)),
    'Migration test blocked external/unowned connection',
  );
  return connect.apply(this, args);
};
global.fetch = async () => {
  throw Error('Migration test blocked fetch');
};
