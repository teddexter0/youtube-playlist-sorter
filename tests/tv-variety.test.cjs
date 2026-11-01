const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { defaultTvProfile, categoryForVideo, selectTvMix, passesMetadataFilter } = require('../lib/tv-profile.ts');
const now = Date.parse('2026-11-01T12:00:00Z');
const video = (id, patch = {}) => ({ videoId: id, title: 'Something worth watching', description: '', channelId: id, channelTitle: 'A channel', topic: 'Science', durationSeconds: 600, publishedAt: '2026-10-30T00:00:00Z', score: .9, reason: 'A match', ...patch });

test('related football niches share one four-video ceiling, including existing queue items', () => {
  const candidates = Array.from({ length: 16 }, (_, i) => video(`v${i}`, { title: i % 2 ? 'Champions League match highlights' : 'FIFA World Cup goals', topic: i % 2 ? 'UEFA' : 'FIFA' }));
  assert.equal(selectTvMix(candidates, { ...defaultTvProfile, sessionMinutes: 240 }, new Set(), now).length, 4);
  const mix = selectTvMix(candidates, { ...defaultTvProfile, sessionMinutes: 240 }, new Set(), now, { categoryCounts: new Map([['football', 3]]) });
  assert.equal(mix.length, 1);
  assert.equal(categoryForVideo(mix[0]), 'football');
});

test('a complete mix uses different lanes, discovery and alternating topics', () => {
  const lanes = ['football', 'technology', 'travel', 'nature', 'music', 'food'];
  const candidates = lanes.flatMap((category, lane) => Array.from({ length: 3 }, (_, i) => video(`${lane}-${i}`, { category, discovery: lane > 2, score: lane < 2 ? 1 : .7 })));
  const mix = selectTvMix(candidates, { ...defaultTvProfile, sessionMinutes: 180 }, new Set(), now);
  assert.ok(new Set(mix.map(categoryForVideo)).size >= 5);
  assert.ok(mix.some(v => v.discovery));
  for (let i = 1; i < mix.length; i++) assert.notEqual(categoryForVideo(mix[i]), categoryForVideo(mix[i - 1]));
});

test('comfort TV excludes heavy talks and raunchy formats while keeping visual stories and football analysis', () => {
  for (const title of ['Jordan B. Peterson: Raising Kids', 'The philosophy of existence', 'Wild N Out best moments', "Wild 'N Out episode", 'Dating advice for men', 'A full interview with a billionaire', 'Lex Fridman: the meaning of life']) {
    assert.equal(passesMetadataFilter(video('a', { title }), defaultTvProfile, now), false, title);
  }
  for (const title of ['Champions League tactical analysis in ten minutes', 'A robot that plants trees', 'Film practical effects behind the scenes', 'Saxophone live performance']) {
    assert.equal(passesMetadataFilter(video('a', { title }), defaultTvProfile, now), true, title);
  }
});

test('news stays brief and current; monthly motorsport remains an occasional cameo', () => {
  assert.equal(passesMetadataFilter(video('a', { title: 'Local news headlines', durationSeconds: 1200 }), defaultTvProfile, now), false);
  assert.equal(passesMetadataFilter(video('a', { title: 'Local news headlines', durationSeconds: 300, publishedAt: '2025-01-01' }), defaultTvProfile, now), false);
  assert.equal(passesMetadataFilter(video('a', { title: 'Citizen TV headlines on AI', durationSeconds: 300 }), defaultTvProfile, now), true);
  const profile = { ...defaultTvProfile, monthlyMotorsport: true };
  const races = Array.from({ length: 5 }, (_, i) => video(String(i), { title: 'F1 race recap' }));
  assert.equal(selectTvMix(races, profile, new Set(), now).length, 1);
  assert.equal(selectTvMix(races, profile, new Set(), now, { monthlyMotorsportSeen: true }).length, 0);
  assert.equal(passesMetadataFilter(video('old', { title: 'F1 race recap', publishedAt: '2025-01-01' }), profile, now), false);
});

test('a recurring channel cannot exceed the limit through repeated top-ups', () => {
  const mix = selectTvMix([video('a', { channelId: 'repeated' }), video('b')], defaultTvProfile, new Set(), now, { channelCounts: new Map([['repeated', 2]]) });
  assert.deepEqual(mix.map(v => v.videoId), ['b']);
});
