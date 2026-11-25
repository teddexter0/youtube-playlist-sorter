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
let state, creates, tasteFails, signedIn, playlistExists, playlistError, runFails, runs, imports;
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
      '@/lib/station-refresh': { recordPlayback: async (userId, videoId, seconds) => ({ userId, videoId, seconds }) },
      '@/lib/station-history': { rememberSeen: async (userId, ids) => { imports.push({ userId, ids }); return ids.length; } },
      '@/lib/stations': { enableStations: async () => state.tv },
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
      '@/lib/session': { getCurrentUserId: () => signedIn ? 'user-a' : null },
      '@/lib/store': { getUserSettings: async () => state },
      '@/lib/firebase': { adminDb: () => db },
      '@/lib/playlist': { parsePlaylistId: value => value },
      '@/lib/tv-profile': require('../lib/tv-profile.ts'),
      '@/lib/station-rules': require('../lib/station-rules.ts'),
      '@/lib/publishers': { searchPublishers: async () => [], publisherFromChannel: channel => ({channelId:channel.id,title:channel.snippet?.title??''}) },
      '@/lib/tv-error': require('../lib/tv-error.ts'),
      '@/lib/tv': { tvQueueCapacity: 60, tvProfileHash: () => 'profile-hash', runTvForUser: async (user, mode, options) => {
        assert.equal(state.tvLockUntil, 0, 'setup releases the lease before filling');
        runs.push({ user, mode, options });
        if (runFails) throw new Error('YouTube quota exceeded');
        return { mode, videos: [{ videoId: 'newvideo001', action: 'Added to TV' }], candidateCount: 5, warnings: [] };
      } },
      '@/lib/google': {
        getYouTubeAccountTaste: async () => {
          if (tasteFails) throw new Error('YouTube unavailable');
          return { interests: ['Science', 'Football'], subscriptionCount: 12, likedCount: 25 };
        },
        listOwnPlaylistTitles: async () => new Set(), uniquePlaylistTitle: title => title,
        findOwnedStationPlaylist: async () => {
          if (playlistError?.response?.status === 404) return null;
          if (playlistError) throw playlistError;
          return playlistExists ? { snippet: { channelId: 'mine' } } : null;
        },
        youtubeForUser: () => ({
          channels: { list: async () => ({ data: { items: [{ id: 'mine' }] } }) },
          playlists: { insert: async args => { creates.push(args); return { data: { id: 'private-tv' } }; } }
        })
      }
    };
    if (request in mocks) return mocks[request];
  }
  return originalLoad.call(this, request, parent, ...args);
};
const { POST: handler } = require('../app/api/tv/route.ts');
const POST = request => handler({ headers: { get: () => null }, nextUrl: { origin: 'https://test.local' }, ...request });
Module._load = originalLoad;
const reset = () => {
  state = { userId: 'user-a', playlistIds: {}, tv: { ...defaultTvProfile, avoid: ['spoilers'], sessionMinutes: 60 } };
  creates = []; tasteFails = false; signedIn = true; playlistExists = true; playlistError = null; runFails = false; runs = [];
  imports = [];
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

test('build creates and fills in one action while keeping daily updates off', async () => {
  reset(); state.tv.interests = ['My saved topic'];
  const result = await POST({ json: async () => ({ action: 'start' }) });
  assert.equal(result.status, 200);
  assert.equal(result.body.run.videos.length, 1);
  assert.equal(runs[0].user.tv.playlistId, 'private-tv');
  assert.deepEqual(runs[0].user.tv.interests, ['My saved topic']);
  assert.deepEqual(runs[0].options, { manual: true, appendLimit: 60 });
  assert.equal(state.tv.liveEnabled, false);
  assert.equal(creates.length, 1);
});

test('deleted playlists are recreated without clearing history or feedback', async () => {
  for (const error of [null, { response: { status: 404 } }]) {
    reset(); state.tv.playlistId = 'deleted-tv'; state.playlistIds.tv = 'deleted-tv';
    state.tvHistory = ['seen-video']; state.tvFeedback = { seen: { action: 'watched' } };
    playlistExists = false; playlistError = error;
    const result = await POST({ json: async () => ({ action: 'start' }) });
    assert.equal(result.body.profile.playlistId, 'private-tv');
    assert.equal(creates.length, 1);
    assert.deepEqual(state.tvHistory, ['seen-video']);
    assert.equal(state.tvFeedback.seen.action, 'watched');
    assert.equal(result.body.run.videos.length, 1);
  }
});

test('quota or permission failures do not create extra playlists', async () => {
  reset(); state.tv.playlistId = 'existing-tv';
  playlistError = Object.assign(new Error('Permission denied'), { code: 403 });
  const result = await POST({ json: async () => ({ action: 'start' }) });
  assert.equal(result.status, 400);
  assert.equal(creates.length, 0);
  assert.equal(state.tvLockUntil, 0);
});

test('failed fill reports the reason and retries reuse the created playlist', async () => {
  reset(); runFails = true;
  const first = await POST({ json: async () => ({ action: 'start' }) });
  assert.match(first.body.runError, /quota/);
  assert.equal(first.body.profile.playlistId, 'private-tv');
  assert.equal(first.body.run, undefined);
  runFails = false;
  const retry = await POST({ json: async () => ({ action: 'start' }) });
  assert.equal(creates.length, 1);
  assert.equal(retry.body.run.videos.length, 1);
});

test('manual top-up bypasses replacement and preserves the daily schedule and source choices', async () => {
  reset(); state.tv.liveEnabled = true; state.tv.useSubscriptions = false;
  state.stationAutopilot = true;
  const result = await POST({ json: async () => ({ action: 'start' }) });
  assert.equal(result.body.profile.liveEnabled, true);
  assert.equal(result.body.profile.useSubscriptions, false);
  assert.equal(state.stationAutopilot, true);
  assert.equal(runs[0].options.appendLimit, 60);
  assert.equal(runs[0].options.forceRefresh, undefined);
});


test('watch-history import is signed-in and account-scoped even with a forged body user ID', async () => {
  reset();
  const body = { action: 'import-watched', videoIds: ['abcdefghijk'], userId: 'other-account' };
  const result = await POST({ json: async () => body });
  assert.equal(result.status, 200);
  assert.deepEqual(imports, [{ userId: 'user-a', ids: ['abcdefghijk'] }]);
  signedIn = false;
  assert.equal((await POST({ json: async () => body })).status, 401);
  assert.equal(imports.length, 1);
});

test('playback progress uses signed-in identity and bounds every sample', async () => {
  reset();
  const body = { action: 'progress', userId: 'other-account', videoId: 'abcdefghijk', seconds: 10, eventId: 'e22732a4-f0c5-4ab6-9a56-9643e4addcb0' };
  const result = await POST({ json: async () => body });
  assert.equal(result.status, 200);
  assert.equal(result.body.progress.userId, 'user-a');
  assert.equal((await POST({ json: async () => ({ ...body, seconds: 120 }) })).status, 400);
  assert.equal((await POST({ headers: { get: () => 'https://evil.example' }, json: async () => body })).status, 403);
  signedIn = false;
  assert.equal((await POST({ json: async () => body })).status, 401);
});

test('custom channel choices keep existing destinations and never accept a body user identity', async () => {
  reset(); state.tv.playlistId = 'existing-tv'; state.tv.interests = ['Pottery'];
  state.tvFeedback = { prior: { action: 'like' } }; state.stationAutopilot = true;
  const result = await POST({ json: async () => ({ action: 'save-stations', userId: 'other', stations: [
    { key: 'tv', name: 'My evening', interests: ['Pottery'] },
    { key: 'custom1', name: 'My ceramics channel', interests: ['Ceramics studio tours'] }
  ] }) });
  assert.equal(result.status, 200);
  assert.equal(state.tv.playlistId, 'existing-tv');
  assert.deepEqual(state.tv.interests, ['Pottery']);
  assert.equal(state.stationProfiles.custom1.displayName, 'My ceramics channel');
  assert.equal(state.stationProfiles.custom1.stationMode, 'tv');
  assert.deepEqual(state.enabledStations, ['tv', 'custom1']);
  assert.equal(state.tvFeedback.prior.action, 'like');
  assert.equal(state.stationAutopilot, false);
  assert.equal(creates.length, 0);
});

test('new accounts cannot enable five channels, duplicate keys, or empty extra topics', async () => {
  reset();
  const row = key => ({ key, name: key, interests: ['My hobby'] });
  for (const stations of [ ['tv','childhood','faith','popculture','lifeskills'].map(row), [row('tv'),row('custom1'),row('custom1')], [row('tv'),{...row('custom1'),interests:[]}] ]) {
    const result = await POST({ json: async () => ({ action: 'save-stations', stations }) });
    assert.equal(result.status, 400);
    assert.equal(state.enabledStations, undefined);
  }
});

test('channel edits require the signed-in account and preserve a legacy owner lineup', async () => {
  reset(); signedIn = false;
  const stations = [{key:'tv',name:'TV',interests:['Art']}];
  assert.equal((await POST({ json: async () => ({ action:'save-stations', stations }) })).status, 401);
  signedIn = true; state.personalStationVersion = 5;
  state.stationProfiles = Object.fromEntries(['childhood','faith','popculture','lifeskills'].map(key => [key,{...defaultTvProfile,playlistId:key,interests:['Saved topic']} ]));
  const legacy = ['tv','childhood','faith','popculture','lifeskills'].map(key=>({key,name:key,interests:['Saved topic']}));
  assert.equal((await POST({ json: async () => ({ action:'save-stations', stations:legacy }) })).status, 200);
  assert.equal(state.stationProfiles.childhood.playlistId, 'childhood');
  assert.equal(creates.length, 0);
});
