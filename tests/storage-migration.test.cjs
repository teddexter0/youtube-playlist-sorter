const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === './runtime-config') return { envValue: () => '' };
  return original.call(this, request, ...args);
};
const { copyAccountStorage } = require('../lib/storage-migration.ts');
Module._load = original;
function fixture({ denied = false, corrupt = false } = {}) {
  const records = { 'users/owner': { tv: { interests: ['astronomy'] }, encryptedRefreshToken: 'encrypted', stationAutopilot: true }, 'users/owner/history/item': { videoId: 'abc' } };
  const copied = {};
  const ref = path => ({ path, get: async () => ({ exists: true, data: () => structuredClone(records[path]) }), update: async patch => Object.assign(records[path], patch), listCollections: async () => path === 'users/owner' ? [{ orderBy: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: [{ ref: ref('users/owner/history/item') }] }) }) }) }] : [] });
  const source = { collection: () => ({ doc: () => ref('users/owner') }), runTransaction: fn => fn({ get: r => r.get(), update: (r, patch) => r.update(patch) }) };
  const target = { collection: () => ({ doc: () => ({ get: async () => { if (denied) throw Error('permission'); } }) }), doc: path => ({ set: async value => { copied[path] = structuredClone(value); }, get: async () => ({ data: () => corrupt ? {} : structuredClone(copied[path]) }) }) };
  return { source, target, records, copied };
}
test('migration verifies the complete account subtree and preserves source until cutover', async () => {
  const f = fixture();
  assert.equal((await copyAccountStorage(f.source, f.target, 'owner')).copied, 2);
  assert.equal(f.records['users/owner'].storageMigrating, true);
  assert.equal(f.copied['users/owner'].storageMigrating, false);
  assert.equal(f.copied['users/owner'].stationAutopilot, true);
  assert.deepEqual(f.copied['users/owner/history/item'], f.records['users/owner/history/item']);
});
test('permission failure does not pause live storage', async () => {
  const f = fixture({ denied: true });
  await assert.rejects(copyAccountStorage(f.source, f.target, 'owner'));
  assert.equal(f.records['users/owner'].storageMigrating, undefined);
});
test('verification failure restores writes to the original account', async () => {
  const f = fixture({ corrupt: true });
  await assert.rejects(copyAccountStorage(f.source, f.target, 'owner'));
  assert.equal(f.records['users/owner'].storageMigrating, false);
});
