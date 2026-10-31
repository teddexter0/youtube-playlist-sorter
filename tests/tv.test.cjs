const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

// Compile with the project's existing TypeScript dependency; no extra test runtime.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText, filename);
const { defaultTvProfile, tvProfileSchema, selectTvMix, passesMetadataFilter } = require('../lib/tv-profile.ts');
const now = Date.parse('2026-10-30T00:00:00Z');
const video = (id, patch = {}) => ({ videoId: id, title: 'A thoughtful documentary', description: '', channelId: id,
  channelTitle: 'Channel', topic: 'Science', durationSeconds: 600, publishedAt: '2026-10-01T00:00:00Z', score: .8, reason: 'match', ...patch });

test('profiles start empty and private to each user; reject unbounded settings', () => {
  assert.deepEqual(defaultTvProfile.interests, []);
  assert.equal(defaultTvProfile.liveEnabled, false);
  assert.equal(defaultTvProfile.aiEnabled, false);
  assert.equal(tvProfileSchema.safeParse({ interests: Array(13).fill('science') }).success, false);
});
test('runtime config removes PowerShell BOM/newlines without exposing values', () => {
  const { envValue } = require('../lib/runtime-config.ts');
  process.env.TV_CONFIG_TEST = '\uFEFFhttps://example.com/callback\r\n';
  assert.equal(envValue('TV_CONFIG_TEST'), 'https://example.com/callback');
  delete process.env.TV_CONFIG_TEST;
});
test('lineup excludes seen and duplicate IDs and respects duration and channel caps', () => {
  const candidates = [video('seen'), video('a'), video('a'), ...Array.from({ length: 8 }, (_, i) => video(`c${i}`, { channelId: 'same' }))];
  const mix = selectTvMix(candidates, { ...defaultTvProfile, sessionMinutes: 30 }, new Set(['seen']), now);
  assert.equal(mix.length, 3);
  assert.equal(new Set(mix.map(v => v.videoId)).size, 3);
  assert.equal(mix.filter(v => v.channelId === 'same').length, 2);
  assert.ok(mix.every(v => v.videoId !== 'seen'));
  assert.ok(mix.reduce((s, v) => s + v.durationSeconds, 0) <= 1800);
});
test('mix alternates interests and includes archive discoveries', () => {
  const candidates = Array.from({ length: 8 }, (_, i) => video(String(i), { topic: i < 4 ? 'Science' : 'Football', publishedAt: i % 2 ? '2018-01-01' : '2026-10-01' }));
  const mix = selectTvMix(candidates, { ...defaultTvProfile, sessionMinutes: 60 }, new Set(), now);
  assert.notEqual(mix[0].topic, mix[1].topic);
  assert.ok(mix.some(v => v.publishedAt === '2018-01-01'));
  assert.ok(mix.some(v => v.publishedAt === '2026-10-01'));
});
test('metadata screening honors exclusions, age-independent respectful topics and runtime bounds', () => {
  assert.equal(passesMetadataFilter(video('a', { title: 'NSFW compilation' }), defaultTvProfile), false);
  assert.equal(passesMetadataFilter(video('a', { title: 'Film spoilers' }), { ...defaultTvProfile, avoid: ['spoilers'] }), false);
  assert.equal(passesMetadataFilter(video('a', { title: 'Respectful discussion of religion and sexuality' }), defaultTvProfile), true);
  assert.equal(passesMetadataFilter(video('a', { durationSeconds: 30 }), defaultTvProfile), false);
});

let state, inserted, failInsert, nativeLikedIds = [];
const ref = { update: async patch => Object.assign(state, patch), collection: () => ({ add: async () => {} }) };
const db = { collection: () => ({ doc: () => ref }), runTransaction: async fn => fn({
  get: async () => ({ data: () => state }), update: (_ref, patch) => Object.assign(state, patch)
}) };
const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  if (parent?.filename === path.resolve(__dirname, '../lib/tv.ts')) {
    if (request === './firebase') return { adminDb: () => db };
    if (request === './google') return {
      youtubeForUser: () => ({
        channels: { list: async () => ({ data: { items: [{ id: 'mine' }] } }) },
        search: { list: async () => ({ data: { items: [{ id: { videoId: 'newvideo001' } }, { id: { videoId: 'newvideo002' } }] } }) },
        playlistItems: { insert: async ({ requestBody }) => {
          if (failInsert && inserted.length) throw new Error('quota exceeded');
          inserted.push(requestBody.snippet.resourceId.videoId);
        } }
      }),
      validatePlaylist: async () => ({ snippet: { channelId: 'mine' } }),
      listPlaylistItems: async () => inserted.map(videoId => ({ contentDetails: { videoId } })),
      getVideos: async (_youtube, ids) => ids.map(id => ({ id, snippet: { title: 'Science documentary', description: '', channelTitle: id, channelId: id, publishedAt: '2026-10-01', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT10M' } })),
      getSubscribedChannelIds: async () => new Set(),
      getYouTubeAccountTaste: async () => ({ likedVideoIds: nativeLikedIds, likedTitles: [], interests: ['Science'] })
    };
    if (request === './tv-ai') return { rankTvCandidates: async () => { throw new Error('AI unavailable'); } };
  }
  return originalLoad.call(this, request, parent, ...args);
};
const { runTvForUser, tvProfileHash } = require('../lib/tv.ts');
Module._load = originalLoad;
const reset = () => {
  state = { userId: 'user-a', playlistIds: {}, tv: { ...defaultTvProfile, interests: ['science'], playlistId: 'TV', liveEnabled: true }, tvHistory: [] };
  state.tvPreviewHash = tvProfileHash(state.tv);
  inserted = []; failInsert = false; nativeLikedIds = [];
};
test('dry run writes no YouTube items; live retries do not duplicate delivered videos', async () => {
  reset();
  const preview = await runTvForUser(state, 'dry-run');
  assert.equal(preview.videos.length, 2); assert.equal(inserted.length, 0);
  await runTvForUser(state, 'live');
  assert.equal(inserted.length, 2); assert.equal(state.tvHistory.length, 2);
  await runTvForUser(state, 'live');
  assert.equal(inserted.length, 2);
  assert.equal(state.tvLockUntil, 0);
});

test('account topics come from YouTube metadata and fall back to subscribed channels', () => {
  const { deriveTasteTopics } = require('../lib/taste-topics.ts');
  assert.deepEqual(deriveTasteTopics([
    { topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Entertainment', 'https://en.wikipedia.org/wiki/Association_football'] } },
    { topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Association_football', 'https://example.com/wiki/Ignore_me'] } }
  ]), ['Association football', 'Entertainment']);
  assert.deepEqual(deriveTasteTopics([], ['Space Science', 'Space Science']), ['Space Science']);
  assert.deepEqual(deriveTasteTopics([]), []);
});
test('native YouTube likes inform the profile without requeueing those exact videos', async () => {
  reset(); nativeLikedIds = ['newvideo001'];
  const result = await runTvForUser(state, 'dry-run');
  assert.deepEqual(result.videos.map(v => v.videoId), ['newvideo002']);
  state.tv.useYouTubeLikes = false;
  const manual = await runTvForUser(state, 'dry-run');
  assert.equal(manual.videos.length, 2);
});
test('partial failures preserve delivered history and release the run lock', async () => {
  reset(); failInsert = true;
  await assert.rejects(runTvForUser(state, 'live'), /quota/);
  assert.equal(state.tvHistory.length, 1); assert.equal(state.tvLockUntil, 0);
  failInsert = false;
  await runTvForUser(state, 'live');
  assert.equal(new Set(inserted).size, 2);
});
test('live runs reject changed preferences, concurrent runs, and Inbox as TV', async () => {
  reset(); state.tv.sessionMinutes = 120;
  await assert.rejects(runTvForUser(state, 'live'), /Preview/);
  reset(); state.tvLockUntil = Date.now() + 60000;
  await assert.rejects(runTvForUser(state, 'dry-run'), /already in progress/);
  reset(); state.playlistIds.inbox = 'TV';
  await assert.rejects(runTvForUser(state, 'dry-run'), /separate TV/);
});
test('AI failure does not silently bypass filtering or add videos', async () => {
  reset(); state.tv.aiEnabled = true; state.tvPreviewHash = tvProfileHash(state.tv);
  await assert.rejects(runTvForUser(state, 'live'), /AI unavailable/);
  assert.equal(inserted.length, 0); assert.equal(state.tvLockUntil, 0);
});

test('full queues stop before discovery and blocked channels stay out', async () => {
  reset(); inserted = Array.from({ length: 40 }, (_, i) => `old${i}`);
  const full = await runTvForUser(state, 'live');
  assert.equal(full.candidateCount, 0); assert.equal(inserted.length, 40);
  reset(); state.tvFeedback = { anotherVideo: { action: 'block-channel', channelId: 'newvideo001' } };
  const run = await runTvForUser(state, 'live');
  assert.deepEqual(run.videos.map(v => v.videoId), ['newvideo002']);
});

test('AI output cannot invent candidate IDs or admit rejected/low-score entries', async () => {
  const originalFetch = global.fetch;
  const oldKey = process.env.AI_GATEWAY_API_KEY, oldModel = process.env.TV_AI_MODEL;
  process.env.AI_GATEWAY_API_KEY = 'test-only'; process.env.TV_AI_MODEL = 'test-only';
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ videos: [
    { videoId: 'a', suitable: true, score: .9, reason: 'Relevant' },
    { videoId: 'b', suitable: false, score: .95, reason: 'Uncertain suitability' },
    { videoId: 'c', suitable: true, score: .2, reason: 'Irrelevant' },
    { videoId: 'invented', suitable: true, score: 1, reason: 'Unknown' }
  ] }) } }] }) });
  try {
    const { rankTvCandidates } = require('../lib/tv-ai.ts');
    const result = await rankTvCandidates(['a', 'b', 'c'].map(id => video(id)), defaultTvProfile, []);
    assert.deepEqual(result.map(v => v.videoId), ['a']);
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"videos":[{"videoId":"a"}]}' } }] }) });
    await assert.rejects(rankTvCandidates([video('a')], defaultTvProfile, []));
  } finally {
    global.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.TV_AI_MODEL; else process.env.TV_AI_MODEL = oldModel;
  }
});
test('Vercel OIDC authenticates AI requests when no gateway key is supplied', async () => {
  const originalFetch = global.fetch;
  const previous = { key: process.env.AI_GATEWAY_API_KEY, model: process.env.TV_AI_MODEL, oidc: process.env.VERCEL_OIDC_TOKEN };
  delete process.env.AI_GATEWAY_API_KEY;
  process.env.TV_AI_MODEL = 'test-only'; process.env.VERCEL_OIDC_TOKEN = 'test-oidc-only';
  let auth;
  global.fetch = async (_url, options) => {
    auth = options.headers.authorization;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"videos":[]}' } }] }) };
  };
  try {
    const { aiConfigured, rankTvCandidates } = require('../lib/tv-ai.ts');
    assert.equal(aiConfigured(), true);
    await rankTvCandidates([video('a')], defaultTvProfile, []);
    assert.equal(auth, 'Bearer test-oidc-only');
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries({ AI_GATEWAY_API_KEY: previous.key, TV_AI_MODEL: previous.model, VERCEL_OIDC_TOKEN: previous.oidc })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('explicit manual fill adds videos with daily TV off; cron stays gated', async () => {
  reset(); state.tv.liveEnabled = false; delete state.tvPreviewHash;
  await assert.rejects(runTvForUser(state, 'live'), /Preview/);
  const result = await runTvForUser(state, 'live', { manual: true });
  assert.equal(result.videos.length, 2);
  assert.equal(inserted.length, 2);
  assert.equal(state.tv.liveEnabled, false);
  assert.equal(state.tvPreviewHash, tvProfileHash(state.tv));
});
