const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText, filename);
const { defaultTvProfile } = require('../lib/tv-profile.ts');
let state, creates, tasteFails, signedIn;
const ref = { update: async patch => {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'playlistIds.tv') state.playlistIds.tv = value;
    else state[key] = value;
  }
} };
const db = { collection: () => ({ doc: () => ref }), runTransaction: async fn => fn({
  get: async () => ({ data: () => state }), update: (_ref, patch) => Object.assign(state, patch)
}) };
const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  if (parent?.filename === path.resolve(__dirname, '../app/api/tv/route.ts')) {
    const mocks = {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      '@/lib/session': { getCurrentUserId: () => signedIn ? 'user-a' : null },
      '@/lib/store': { getUserSettings: async () => state },
      '@/lib/firebase': { adminDb: () => db },
      '@/lib/playlist': { parsePlaylistId: value => value },
      '@/lib/tv-profile': require('../lib/tv-profile.ts'),
      '@/lib/tv': {},
      '@/lib/google': {
        getYouTubeAccountTaste: async () => {
          if (tasteFails) throw new Error('YouTube unavailable');
          return { interests: ['Science', 'Football'], subscriptionCount: 12, likedCount: 25 };
        },
        listOwnPlaylistTitles: async () => new Set(), uniquePlaylistTitle: title => title,
        youtubeForUser: () => ({ playlists: { insert: async args => { creates.push(args); return { data: { id: 'private-tv' } }; } } })
      }
    };
    if (request in mocks) return mocks[request];
  }
  return originalLoad.call(this, request, parent, ...args);
};
const { POST } = require('../app/api/tv/route.ts');
Module._load = originalLoad;
const reset = () => {
  state = { userId: 'user-a', playlistIds: {}, tv: { ...defaultTvProfile, avoid: ['spoilers'], sessionMinutes: 60 } };
  creates = []; tasteFails = false; signedIn = true;
};
const importTaste = () => POST({ json: async () => ({ action: 'import-taste' }) });

test('account setup creates one private playlist and preserves the user preferences', async () => {
  reset();
  const first = await importTaste();
  assert.equal(first.status, 200);
  assert.deepEqual(state.tv.interests, ['Science', 'Football']);
  assert.deepEqual(state.tv.avoid, ['spoilers']);
  assert.equal(state.tv.sessionMinutes, 60);
  assert.equal(state.tv.liveEnabled, false);
  assert.equal(creates[0].requestBody.status.privacyStatus, 'private');
  assert.equal(state.playlistIds.tv, 'private-tv');
  assert.equal(first.body.likedCount, 25);
  assert.equal(state.tvLockUntil, 0);
  await importTaste();
  assert.equal(creates.length, 1);
});

test('account import failure releases the lease without creating a playlist', async () => {
  reset(); tasteFails = true;
  const result = await importTaste();
  assert.equal(result.status, 400);
  assert.equal(state.tvLockUntil, 0);
  assert.equal(creates.length, 0);
  assert.deepEqual(state.tv.interests, []);
});

test('account setup requires sign-in and refuses an active TV action', async () => {
  reset(); signedIn = false;
  assert.equal((await importTaste()).status, 401);
  signedIn = true; state.tvLockUntil = Date.now() + 60000; state.tvLock = 'other-run';
  assert.equal((await importTaste()).status, 400);
  assert.equal(state.tvLock, 'other-run');
  assert.equal(creates.length, 0);
});
