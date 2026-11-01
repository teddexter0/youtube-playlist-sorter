const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText, filename);

const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  if (parent?.filename === path.resolve(__dirname, '../lib/google.ts')) {
    if (request === 'googleapis') return { google: {} };
    if (request.startsWith('@/')) return {};
  }
  return originalLoad.call(this, request, parent, ...args);
};
const { validatePlaylist } = require('../lib/google.ts');
Module._load = originalLoad;
const { tvErrorDetails } = require('../lib/tv-error.ts');

test('playlist validation sends a single filter accepted by YouTube', async () => {
  let parameters;
  const youtube = { playlists: { list: async args => {
    parameters = args;
    // Match the provider contract: even mine=false must not accompany id.
    const filters = ['id', 'mine', 'channelId'].filter(key => key in args);
    assert.deepEqual(filters, ['id']);
    return { data: { items: [{ id: 'my-tv' }] } };
  } } };
  assert.equal((await validatePlaylist(youtube, 'my-tv')).id, 'my-tv');
  assert.deepEqual(parameters.id, ['my-tv']);
  assert.equal(await validatePlaylist({ playlists: { list: async () => ({ data: { items: [] } }) } }, 'missing'), null);
});

test('YouTube quota, disabled API and revoked permission errors give useful instructions', () => {
  const failure = reason => ({ response: { data: { error: { errors: [{ reason }] } } } });
  assert.equal(tvErrorDetails(failure('quotaExceeded')).status, 429);
  assert.equal(tvErrorDetails(failure('accessNotConfigured')).code, 'YOUTUBE_API_DISABLED');
  assert.equal(tvErrorDetails(failure('insufficientPermissions')).code, 'RECONNECT_GOOGLE');
  assert.equal(tvErrorDetails({ response: { data: { error: 'invalid_grant' } } }).code, 'RECONNECT_GOOGLE');
});

test('invalid settings identify their field without returning user data', () => {
  const { z } = require('zod');
  const result = z.object({ profile: z.object({ sessionMinutes: z.number().max(240) }) }).safeParse({ profile: { sessionMinutes: 999 } });
  const details = tvErrorDetails(result.error);
  assert.equal(details.code, 'INVALID_SETTINGS');
  assert.match(details.error, /profile.sessionMinutes/);
});

test('error reporting never serializes request credentials', () => {
  const error = Object.assign(new Error('Request failed'), { config: { headers: { authorization: 'Bearer secret-token' } } });
  assert.equal(JSON.stringify(tvErrorDetails(error)).includes('secret-token'), false);
  assert.equal(tvErrorDetails(new Error('Bearer secret-token client_secret=private-key')).error.includes('private-key'), false);
});
