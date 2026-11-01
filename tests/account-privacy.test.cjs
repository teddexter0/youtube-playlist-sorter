const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-only-account-signing-key';
test.after(() => { if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY; else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey; });
let cookie, records, revoked, deleted;
const ref = id => ({ id, get: async () => ({ exists: records.has(id), data: () => records.get(id) }) });
const db = { collection: name => { assert.equal(name, 'users'); return { doc: id => ref(id) }; }, runTransaction: fn => fn({ get: r => r.get(), set: (r, patch) => records.set(r.id, { ...records.get(r.id), ...patch }) }), recursiveDelete: async r => { deleted.push(r.id); records.delete(r.id); } };
const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  if (parent?.filename === path.resolve(__dirname, '../lib/session.ts') && request === 'next/headers') return { cookies: () => ({ get: () => ({ value: cookie }), delete: () => { cookie = undefined; } }) };
  if (parent?.filename === path.resolve(__dirname, '../lib/store.ts')) {
    if (request === '@/lib/firebase') return { adminDb: () => db };
    if (request === 'firebase-admin/firestore') return { FieldValue: {} };
  }
  if (parent?.filename === path.resolve(__dirname, '../app/api/account/disconnect/route.ts')) {
    if (request === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
    if (request === '@/lib/session') return require('../lib/session.ts');
    if (request === '@/lib/store') return require('../lib/store.ts');
    if (request === '@/lib/firebase') return { adminDb: () => db };
    if (request === '@/lib/google') return { oauthClient: () => ({ revokeToken: async token => revoked.push(token) }) };
    if (request === '@/lib/crypto') return { decryptSecret: token => token };
  }
  return originalLoad.call(this, request, parent, ...args);
};
const session = require('../lib/session.ts');
const store = require('../lib/store.ts');
const { POST } = require('../app/api/account/disconnect/route.ts');
Module._load = originalLoad;
const reset = () => {
  records = new Map([
    ['alice', { userId: 'alice', playlistIds: { tv: 'alice-tv' }, tv: { interests: ['travel'] }, encryptedRefreshToken: 'alice-token', createdAt: 'today', updatedAt: 'today' }],
    ['bob', { userId: 'bob', playlistIds: { tv: 'bob-tv' }, tv: { interests: ['music'] }, encryptedRefreshToken: 'bob-token', createdAt: 'today', updatedAt: 'today' }]
  ]);
  revoked = []; deleted = []; cookie = session.signUserId('bob');
};

test('signed-in users cannot change identity by editing the session identifier', () => {
  reset();
  assert.equal(session.getCurrentUserId(), 'bob');
  cookie = cookie.replace('bob.', 'alice.');
  assert.equal(session.getCurrentUserId(), null);
});

test('account records and preferences stay separate and browser settings omit tokens', async () => {
  reset();
  await store.upsertUserSettings('bob', { tv: { interests: ['football'] } });
  assert.deepEqual((await store.getUserSettings('alice')).tv.interests, ['travel']);
  assert.deepEqual((await store.getUserSettings('bob')).tv.interests, ['football']);
  const publicSettings = store.publicUserSettings(await store.getUserSettings('bob'));
  assert.equal(publicSettings.playlistIds.tv, 'bob-tv');
  assert.equal(JSON.stringify(publicSettings).includes('bob-token'), false);
  assert.equal(JSON.stringify(publicSettings).includes('alice'), false);
});

test('disconnect deletes and revokes only the signed-in account, ignoring body IDs', async () => {
  reset();
  const result = await POST({ headers: { get: () => 'https://test.local' }, nextUrl: { origin: 'https://test.local' }, json: async () => ({ userId: 'alice' }) });
  assert.equal(result.status, 200);
  assert.deepEqual(deleted, ['bob']);
  assert.deepEqual(revoked, ['bob-token']);
  assert.ok(records.has('alice'));
  assert.equal(session.getCurrentUserId(), null);
});

test('cross-origin deletion and unsigned requests cannot touch stored accounts', async () => {
  reset();
  assert.equal((await POST({ headers: { get: () => 'https://other.example' }, nextUrl: { origin: 'https://test.local' } })).status, 403);
  cookie = undefined;
  assert.equal((await POST({ headers: { get: () => null }, nextUrl: { origin: 'https://test.local' } })).status, 401);
  assert.equal(deleted.length, 0);
});
